import type { GameInput, GameState } from "./physics";
import { TICK_MS, initialState, step } from "./physics";
import type { Obstacle } from "./spawn";
import { hitTest } from "./spawn";
import type { ScoreFacts } from "./scorecard";
import { cardLine, scoreCardSvg } from "./scorecard";
import type { Rng } from "../storytell";
import type { Tokens } from "./draw";
import { CANVAS_H, CANVAS_W, drawAttract, render, terrainElevRange } from "./draw";
import type { TerrainPoint } from "./terrain";

/** Spiral-of-death guard: at most this many fixed ticks run per animation
 *  frame, no matter how large the frame's real elapsed time was (a
 *  backgrounded tab regaining focus, a slow first frame, a debugger pause,
 *  …) — any backlog beyond this is dropped rather than caught up on. */
const MAX_STEPS_PER_FRAME = 5;

/** 90 ticks * TICK_MS (1000/120 ~= 8.33ms) = 750ms, exactly the 0.75s
 *  stumble window the brief specifies. */
const STUMBLE_TICKS = 90;

const BEAST_FLASH_MS = 1400;

/** How far ahead of the runner render() needs obstacles: the camera shows
 *  (CANVAS_W * 0.7)/PX_PER_M ≈ 93m ahead of the runner, plus slack for the
 *  widest glyph's half-width (hill draws 140px ≈ 23m wide). */
const VISIBLE_AHEAD_M = 110;

/** How far ahead collision needs obstacles: an obstacle can only overlap the
 *  runner once its left edge is within the runner's half-width (0.3m); 2m
 *  comfortably covers that plus the sub-tick advance. */
const COLLISION_AHEAD_M = 2;
const CARD_EXPORT_SCALE = 2;
const CARD_W = 480;
const CARD_H = 300;
const REVOKE_DELAY_MS = 1000;
const KEEP_CARD_FILENAME = "inkline-scorecard.png";

export interface GameDom {
  frame: HTMLElement;
  kmEl: HTMLElement;
  flashEl: HTMLElement;
  deathOverlay: HTMLElement;
  scoreImg: HTMLImageElement;
  restartBtn: HTMLButtonElement;
  keepBtn: HTMLButtonElement;
}

export interface GameEngineDeps {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  terrain: readonly TerrainPoint[];
  /** The deterministic spawn layout, xM-sorted — reused verbatim on "run it
   *  back" (same seed, same obstacles) and never mutated or copied: the
   *  engine windows into it with a fog cursor + hit set (see below). */
  obstacles: readonly Obstacle[];
  tokens: Tokens;
  realKm: number;
  rng: Rng;
  dom: GameDom;
  reducedMotion: boolean;
}

export interface GameEngine {
  start(): void;
  destroy(): void;
}

function furthestBeastAt(originalObstacles: readonly Obstacle[], xM: number): string | null {
  // originalObstacles is in strictly-increasing xM order (spawnObstacles'
  // contract), so the last one at-or-before xM is simply the last match.
  let name: string | null = null;
  for (const o of originalObstacles) {
    if (o.xM > xM) break;
    name = o.name;
  }
  return name;
}

/** Wires the fixed-tick accumulator loop, input, collision glue, HUD, and
 *  the death/restart/keep-card flows for one mounted game. Everything here
 *  may use rAF/performance.now/Math.random (delegated further into
 *  draw.ts's fog flourish) — but never touches `GameState` except by
 *  calling the pure `step()`, so the simulation itself stays exactly as
 *  deterministic as Task E1 left it. */
export function createGameEngine(deps: GameEngineDeps): GameEngine {
  const { canvas, ctx, terrain, tokens, realKm, dom, rng, reducedMotion } = deps;
  const originalObstacles = deps.obstacles;
  const [elevMin, elevMax] = terrainElevRange(terrain);

  // Obstacle bookkeeping is windowed, not filtered: `originalObstacles` is
  // never copied or reallocated (a real export's year can spawn thousands).
  // `fogIdx` is a monotonic cursor past everything The Quiet has swallowed
  // (same right-edge rule as spawn.ts's alive()), and hit obstacles go into
  // `removedObstacles` — so each frame/tick touches only the O(visible)
  // slice, never the whole array.
  let fogIdx = 0;
  const removedObstacles = new Set<Obstacle>();
  let state: GameState = initialState();
  let started = false;
  let dead = false;
  let beastHits = 0;
  let jumpQueued = false;
  let rafId = 0;
  let lastTimeMs = 0;
  let accumulatorMs = 0;
  let flashTimer = 0;
  /** Pending "keep the card" object-URL revocation (id + its URL) so
   *  destroy() can settle it instead of leaving a timer aimed at a
   *  torn-down game. */
  let revokeTimer = 0;
  let revokeUrl: string | null = null;
  let attractStart = performance.now();
  let destroyed = false;

  function kmSurvived(): number {
    return state.xM / 1000;
  }

  function updateHud(): void {
    const km = kmSurvived();
    dom.kmEl.textContent = `${km.toFixed(2)} km`;
    dom.frame.setAttribute("data-km", km.toFixed(2));
    dom.frame.setAttribute("data-beast-hits", String(beastHits));
  }

  function flashBeast(name: string): void {
    dom.flashEl.textContent = `${name} got you by the ankle`;
    dom.flashEl.classList.add("is-flashing");
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      dom.flashEl.classList.remove("is-flashing");
    }, BEAST_FLASH_MS);
  }

  /** The obstacles that currently matter, up to `aheadM` past the runner:
   *  advances the fog cursor (right edge <= quietXM ⇒ swallowed, gone for
   *  good — fog never retreats, so the cursor only moves forward and the
   *  total advancement over a whole run is O(n) amortized), then collects
   *  the not-yet-hit slice. Cost per call is O(returned slice). */
  function windowObstacles(aheadM: number): Obstacle[] {
    while (
      fogIdx < originalObstacles.length &&
      originalObstacles[fogIdx]!.xM + originalObstacles[fogIdx]!.widthM / 2 <= state.quietXM
    ) {
      fogIdx++;
    }
    const out: Obstacle[] = [];
    for (let i = fogIdx; i < originalObstacles.length; i++) {
      const o = originalObstacles[i]!;
      if (o.xM - o.widthM / 2 > state.xM + aheadM) break;
      if (!removedObstacles.has(o)) out.push(o);
    }
    return out;
  }

  function handleCollisions(): void {
    const hit = hitTest(state.xM, state.yM, windowObstacles(COLLISION_AHEAD_M));
    if (hit) {
      state = { ...state, stumbleUntilTick: state.tick + STUMBLE_TICKS };
      removedObstacles.add(hit);
      beastHits += 1;
      flashBeast(hit.name);
    }
  }

  function showDeathOverlay(): void {
    const facts: ScoreFacts = {
      kmSurvived: kmSurvived(),
      realKm,
      beastHits,
      furthestBeast: furthestBeastAt(originalObstacles, state.xM),
    };
    const line = cardLine(rng, facts.kmSurvived);
    const svg = scoreCardSvg(facts, line);
    dom.scoreImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    dom.deathOverlay.hidden = false;
  }

  function tick(input: GameInput): void {
    state = step(state, input);
    handleCollisions();
    if (!dead && !state.alive) {
      dead = true;
      showDeathOverlay();
    }
  }

  function frame(now: number): void {
    if (destroyed) return;
    rafId = requestAnimationFrame(frame);

    // Fog does not eat you in another tab: freeze entirely while hidden,
    // and don't let the hidden interval count as elapsed time once we
    // return (handled by resetting lastTimeMs on visibilitychange below).
    if (document.hidden) return;

    if (!started) {
      drawAttract(ctx, terrain, elevMin, elevMax, tokens, reducedMotion, now - attractStart);
      return;
    }

    if (dead) {
      render(ctx, {
        terrain,
        elevMin,
        elevMax,
        obstacles: windowObstacles(VISIBLE_AHEAD_M),
        state,
        tokens,
        reducedMotion,
      });
      return;
    }

    const dt = lastTimeMs === 0 ? 0 : now - lastTimeMs;
    lastTimeMs = now;
    accumulatorMs += dt;

    let steps = 0;
    while (accumulatorMs >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      const input: GameInput = { jumpPressed: jumpQueued };
      jumpQueued = false;
      tick(input);
      accumulatorMs -= TICK_MS;
      steps += 1;
      if (dead) break;
    }
    if (steps === MAX_STEPS_PER_FRAME) accumulatorMs = 0; // drop backlog, don't spiral

    updateHud();
    render(ctx, {
      terrain,
      elevMin,
      elevMax,
      obstacles: windowObstacles(VISIBLE_AHEAD_M),
      state,
      tokens,
      reducedMotion,
    });
  }

  function onJumpInput(): void {
    if (destroyed || dead) return;
    if (!started) {
      started = true;
      lastTimeMs = 0;
      accumulatorMs = 0;
    }
    jumpQueued = true;
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      onJumpInput();
    }
  }

  function onPointerdown(): void {
    onJumpInput();
  }

  function onVisibilityChange(): void {
    if (!document.hidden) {
      // Resume cleanly rather than catching up on however long the tab
      // was hidden — the very next frame's dt would otherwise be huge.
      lastTimeMs = 0;
    }
  }

  function restart(): void {
    state = initialState();
    fogIdx = 0; // same seed, same layout — just rewind the window
    removedObstacles.clear();
    beastHits = 0;
    dead = false;
    started = false;
    jumpQueued = false;
    lastTimeMs = 0;
    accumulatorMs = 0;
    attractStart = performance.now();
    dom.deathOverlay.hidden = true;
    dom.flashEl.textContent = "";
    dom.flashEl.classList.remove("is-flashing");
    updateHud();
  }

  async function keepCard(): Promise<void> {
    const src = dom.scoreImg.src;
    if (!src) return;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("game: score card image failed to decode"));
        el.src = src;
      });

      const w = CARD_W * CARD_EXPORT_SCALE;
      const h = CARD_H * CARD_EXPORT_SCALE;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const outCtx = out.getContext("2d");
      if (!outCtx) throw new Error("game: 2d canvas context unavailable for the score-card export");
      outCtx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("game: canvas.toBlob produced no blob for the score card"));
        }, "image/png");
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = KEEP_CARD_FILENAME;
      a.click();
      revokeUrl = url;
      revokeTimer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        if (revokeUrl === url) revokeUrl = null;
      }, REVOKE_DELAY_MS);
    } catch (err) {
      console.error(err);
    }
  }

  function onKeepClick(): void {
    void keepCard();
  }

  dom.restartBtn.addEventListener("click", restart);
  dom.keepBtn.addEventListener("click", onKeepClick);

  return {
    start(): void {
      updateHud();
      window.addEventListener("keydown", onKeydown);
      canvas.addEventListener("pointerdown", onPointerdown);
      document.addEventListener("visibilitychange", onVisibilityChange);
      rafId = requestAnimationFrame(frame);
    },
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.clearTimeout(flashTimer);
      // Settle any pending score-card revocation now: clear the timer and
      // revoke its URL immediately rather than leaking it forever. (The
      // download's fetch of the blob URL began at .click(); by teardown
      // time — a user gesture later — that's comfortably underway.)
      window.clearTimeout(revokeTimer);
      if (revokeUrl !== null) {
        URL.revokeObjectURL(revokeUrl);
        revokeUrl = null;
      }
      window.removeEventListener("keydown", onKeydown);
      canvas.removeEventListener("pointerdown", onPointerdown);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      dom.restartBtn.removeEventListener("click", restart);
      dom.keepBtn.removeEventListener("click", onKeepClick);
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    },
  };
}
