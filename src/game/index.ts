import type { Year } from "../ingest";
import type { Book } from "../storytell";
import { Rng, seedFromYear } from "../storytell";
import { CANVAS_H, CANVAS_W } from "./draw";
import type { GameDom } from "./game";
import { createGameEngine } from "./game";
import { spawnObstacles } from "./spawn";
import { stitchTerrain, terrainLengthM } from "./terrain";

export interface GameHandle {
  /** Cancels the rAF loop, removes every listener, clears the canvas, and
   *  empties the mount's DOM. Safe to call more than once. */
  teardown(): void;
}

const TOKEN_VARS = ["--paper", "--ink", "--pencil", "--ink-faint"] as const;

function readTokens(el: Element): { paper: string; ink: string; pencil: string; inkFaint: string } {
  const computed = getComputedStyle(el);
  const read = (name: (typeof TOKEN_VARS)[number]): string => computed.getPropertyValue(name).trim();
  return {
    paper: read("--paper") || "#faf6ec",
    ink: read("--ink") || "#26211a",
    pencil: read("--pencil") || "#4e525c",
    inkFaint: read("--ink-faint") || "#6f6759",
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface GameDomBundle {
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  dom: GameDom;
}

function buildDom(container: HTMLElement): GameDomBundle {
  container.innerHTML = [
    `<div class="game-frame" data-km="0.00" data-beast-hits="0">`,
    `<canvas class="game-canvas no-print" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>`,
    `<div class="game-hud no-print">`,
    `<div class="game-km">0.00 km</div>`,
    `<div class="game-flash" aria-live="polite"></div>`,
    `</div>`,
    `<div class="game-death no-print" hidden>`,
    `<img class="game-death-card" alt="your outrun-the-quiet score card" />`,
    `<div class="game-death-actions">`,
    `<button type="button" class="game-restart-btn">run it back</button>`,
    `<button type="button" class="game-keep-btn">keep the card</button>`,
    `</div>`,
    `</div>`,
    `</div>`,
  ].join("");

  const frame = container.querySelector<HTMLElement>(".game-frame")!;
  const canvas = frame.querySelector<HTMLCanvasElement>(".game-canvas")!;
  const kmEl = frame.querySelector<HTMLElement>(".game-km")!;
  const flashEl = frame.querySelector<HTMLElement>(".game-flash")!;
  const deathOverlay = frame.querySelector<HTMLElement>(".game-death")!;
  const scoreImg = frame.querySelector<HTMLImageElement>(".game-death-card")!;
  const restartBtn = frame.querySelector<HTMLButtonElement>(".game-restart-btn")!;
  const keepBtn = frame.querySelector<HTMLButtonElement>(".game-keep-btn")!;

  return { frame, canvas, dom: { frame, kmEl, flashEl, deathOverlay, scoreImg, restartBtn, keepBtn } };
}

/**
 * Mounts "Outrun the Quiet" into `container` (the book's `.game-mount` div):
 * stitches the reader's own runs into terrain, spawns obstacles from their
 * own beasts (seeded from `seedFromYear(year)` — deterministic per year),
 * and starts the attract-mode loop. Returns a handle whose `teardown` tears
 * the whole thing back down, for `main.ts`'s start-over chain.
 */
export function initGame(container: HTMLElement, year: Year, book: Book): GameHandle {
  const terrain = stitchTerrain(year.runs);
  const rng = new Rng(seedFromYear(year));
  const obstacles = spawnObstacles(rng, book.beasts, terrainLengthM(terrain));

  const { canvas, dom } = buildDom(container);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("game: 2d canvas context unavailable");

  // dpr-aware backing buffer: the CSS layer scales the canvas element to
  // the container width (shell.css: width 100%, aspect-ratio 800/360), so
  // the drawing code itself always works in the fixed 800x360 logical
  // space regardless of dpr or displayed size.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  ctx.scale(dpr, dpr);

  // Shared mutable token box: the engine (and every draw call under it)
  // holds this ONE object and reads its properties per frame, so refreshing
  // the colors is just an in-place overwrite. A MutationObserver on the
  // root element's data-theme attribute (same pattern as
  // living/atmosphere.ts) re-resolves the custom properties whenever the
  // toolbar's theme toggle flips — without it, a mid-game theme change
  // would leave the canvas painting stale colors forever.
  const tokens = readTokens(container);
  const themeObserver = new MutationObserver(() => {
    Object.assign(tokens, readTokens(container));
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  const engine = createGameEngine({
    canvas,
    ctx,
    terrain,
    obstacles,
    tokens,
    realKm: book.colophon.totalKm,
    rng,
    dom,
    reducedMotion: prefersReducedMotion(),
  });

  engine.start();

  return {
    teardown(): void {
      themeObserver.disconnect();
      engine.destroy();
      container.innerHTML = "";
    },
  };
}
