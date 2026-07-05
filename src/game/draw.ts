import { hashString } from "../storytell";
import type { TerrainPoint } from "./terrain";
import { elevAt } from "./terrain";
import type { GameState } from "./physics";
import { initialState } from "./physics";
import type { Obstacle } from "./spawn";

/** Logical canvas size — the CSS layer scales this up/down to fit the
 *  container (dpr-aware), but every draw call in this file works entirely
 *  in this fixed 800x360 coordinate space. */
export const CANVAS_W = 800;
export const CANVAS_H = 360;

/** World-meters -> px horizontal scale. */
export const PX_PER_M = 6;

/** The runner's fixed screen position; the world scrolls under it. */
export const RUNNER_SCREEN_X = CANVAS_W * 0.3;

/** Baseline the (unexaggerated) ground sits on, inside the lower elevation
 *  band described below. */
const GROUND_BASE_Y = CANVAS_H * 0.78;

/** Half of the "lower 40% of canvas" elevation budget (40% of 360 = 144px;
 *  elevation swings +/- around the baseline, so each side gets 120px — see
 *  the vertical-scale doc comment for how this caps exaggeration). */
const ELEV_BAND_HALF_PX = 120;

const VERTICAL_SCALE_CAP = 3;

/** World-segment granularity the terrain polyline samples/jitters at. */
const TERRAIN_SEGMENT_M = 20;
const TERRAIN_JITTER_PX = 3;

/** DELIBERATE visual/hitbox decoupling: obstacle hitboxes (spawn.ts
 *  SIZE_BY_KIND) are physical-scale — tuned to the jump arc, all under
 *  0.6m tall — which at 6 px/m would draw as a ~2-4px speck. Each beast
 *  glyph is instead drawn at max(heightM * PX_PER_M, this floor) tall,
 *  width scaled by the same factor (aspect preserved), anchored at the
 *  ground line. The drawn beast is therefore BIGGER than what can actually
 *  trip you — hitboxes stay honest and generous-feeling, glyphs stay
 *  charming doodles. Do not "fix" one side to match the other. */
const OBSTACLE_MIN_GLYPH_PX = 30;

const RUNNER_LOCAL_SCALE = 3.4;
const RUNNER_STRIDE_M = 6;

/** Visual-only vertical exaggeration for the jump: the physical apex is
 *  ~1.15m (≈7px at PX_PER_M 6), which would read as a twitch next to the
 *  30px-floor beast glyphs. Drawn at 30 px/m the hop peaks at ~34px — about
 *  one runner body height, cresting just above the glyphs it (physically,
 *  honestly) clears. Same decoupling philosophy as OBSTACLE_MIN_GLYPH_PX:
 *  the simulation is untouched, only the drawing is exaggerated. */
const JUMP_VISUAL_PX_PER_M = 30;

const FOG_EDGE_SEGMENT_PX = 16;
const FOG_EDGE_JITTER_PX = 4;
const FOG_CRUMB_COUNT = 14;
const FOG_CRUMB_SPREAD_PX = 20;

const ATTRACT_TEXT = "press space / tap to run";
const ATTRACT_BOB_AMPLITUDE_PX = 3;
const ATTRACT_BOB_PERIOD_MS = 1400;

const HAND_FONT = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';

/** The six CSS custom properties every ink stroke in the book is drawn
 *  from, read via getComputedStyle at init (and on theme change) by the
 *  caller — canvas has no equivalent of `var(--ink)`, so the resolved
 *  literal strings are threaded through every draw call instead. */
export interface Tokens {
  paper: string;
  ink: string;
  pencil: string;
  inkFaint: string;
}

interface Camera {
  worldXM: number;
}

/**
 * Vertical exaggeration scale for drawing elevation: the terrain's
 * elevation range is mapped into a fixed pixel budget (the lower 40% of
 * the canvas), capped at 3 px/m so a perfectly flat/short course — or a
 * degenerate zero-length range — never divides by zero and never draws
 * absurdly steep. `120 / (range || 1)` with `range = elevMax - elevMin`:
 * a zero range harmlessly becomes `120/1 = 120`, immediately clamped to
 * the cap of 3.
 */
export function verticalScale(elevMin: number, elevMax: number): number {
  const range = elevMax - elevMin;
  return Math.min(VERTICAL_SCALE_CAP, ELEV_BAND_HALF_PX / (range || 1));
}

/** min/max elevation across a terrain — a manual loop (not
 *  `Math.min(...arr)`) because a full running year's terrain can have far
 *  more points than V8's safe spread-argument limit. Empty terrain -> [0,0]
 *  (verticalScale(0,0) then correctly falls back to the cap). */
export function terrainElevRange(terrain: readonly TerrainPoint[]): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const p of terrain) {
    if (p.elevM < mn) mn = p.elevM;
    if (p.elevM > mx) mx = p.elevM;
  }
  if (!Number.isFinite(mn)) return [0, 0];
  return [mn, mx];
}

function worldToScreenX(camera: Camera, xM: number): number {
  return RUNNER_SCREEN_X + (xM - camera.worldXM) * PX_PER_M;
}

function groundYAt(terrain: readonly TerrainPoint[], xM: number, elevMin: number, vScale: number): number {
  return GROUND_BASE_Y - (elevAt(terrain, xM) - elevMin) * vScale;
}

/** Stable per-segment jitter: the same world segment index always produces
 *  the same tiny pixel offset, frame after frame — no "boiling" line noise
 *  even though the polyline itself scrolls under the camera every frame.
 *  Seeded via hashString, NEVER Math.random (see game.ts's determinism
 *  note — Math.random is reserved for the fog's eraser-crumb flourish). */
function segmentJitter(label: string, index: number, amplitudePx: number): number {
  const h = hashString(`${label}:${index}`);
  return ((h % 1000) / 1000 - 0.5) * amplitudePx;
}

/** Terrain = a single ink polyline across the visible world window. */
function drawTerrain(
  ctx: CanvasRenderingContext2D,
  terrain: readonly TerrainPoint[],
  camera: Camera,
  elevMin: number,
  vScale: number,
  tokens: Tokens,
): void {
  const halfSpanM = CANVAS_W / PX_PER_M / 2 + TERRAIN_SEGMENT_M;
  const startXM = Math.max(0, camera.worldXM - halfSpanM);
  const endXM = camera.worldXM + halfSpanM;

  ctx.save();
  ctx.strokeStyle = tokens.ink;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  let first = true;
  for (let xM = startXM; xM <= endXM; xM += TERRAIN_SEGMENT_M) {
    const segIndex = Math.floor(xM / TERRAIN_SEGMENT_M);
    const y = groundYAt(terrain, xM, elevMin, vScale) + segmentJitter("terrain-seg", segIndex, TERRAIN_JITTER_PX);
    const x = worldToScreenX(camera, xM);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function strokeSegments(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** "quiet" beast — a snoozing lump with a drifting zzz. 5 strokes. */
function drawQuiet(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.bezierCurveTo(-w / 2, -h * 1.1, w / 2, -h * 1.1, w / 2, 0);
  ctx.stroke(); // 1: dome
  strokeSegments(ctx, [[-w / 2, 0], [w / 2, 0]]); // 2: base
  const zx = w * 0.15;
  const zy = -h * 1.3;
  strokeSegments(ctx, [
    [zx, zy],
    [zx + 6, zy - 5],
    [zx + 2, zy - 5],
    [zx + 8, zy - 10],
  ]); // 3: zzz small
  strokeSegments(ctx, [
    [zx + 10, zy - 14],
    [zx + 16, zy - 19],
    [zx + 12, zy - 19],
    [zx + 18, zy - 24],
  ]); // 4: zzz medium
  strokeSegments(ctx, [
    [zx + 20, zy - 28],
    [zx + 24, zy - 32],
  ]); // 5: zzz large, trailing off
}

/** "false-start" beast — a banana. 5 strokes. */
function drawFalseStart(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.bezierCurveTo(-w / 2, -h * 0.6, w * 0.1, -h * 1.4, w / 2, -h * 1.2);
  ctx.stroke(); // 1: outer curve
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 3, -2);
  ctx.bezierCurveTo(-w * 0.2, -h * 0.5, w * 0.2, -h * 1.1, w / 2 - 2, -h * 1.0);
  ctx.stroke(); // 2: inner curve
  strokeSegments(ctx, [[-w / 2, 0], [-w / 2 - 4, 3]]); // 3: stem tick
  strokeSegments(ctx, [[w / 2, -h * 1.2], [w / 2 + 3, -h * 1.35]]); // 4: tip tick
  strokeSegments(ctx, [[-w * 0.1, -h * 0.7], [-w * 0.05, -h * 0.75]]); // 5: ripening speckle
}

/** "hill" beast — a grassy rise. 6 strokes. */
function drawHill(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.quadraticCurveTo(-w * 0.15, -h * 1.3, 0, -h * 1.35);
  ctx.quadraticCurveTo(w * 0.2, -h * 1.1, w / 2, 0);
  ctx.stroke(); // 1: slope silhouette
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -h * 0.4);
  ctx.quadraticCurveTo(0, -h * 0.6, w * 0.3, -h * 0.4);
  ctx.stroke(); // 2: mid-slope contour
  strokeSegments(ctx, [[-w * 0.05, -h * 1.3], [-w * 0.08, -h * 1.5]]); // 3: grass tuft
  strokeSegments(ctx, [[0, -h * 1.35], [0, -h * 1.55]]); // 4: grass tuft
  strokeSegments(ctx, [[w * 0.06, -h * 1.3], [w * 0.09, -h * 1.5]]); // 5: grass tuft
  strokeSegments(ctx, [[-w / 2, 0], [w / 2, 0]]); // 6: base line
}

/** "night" beast — a crescent riding a small mound. 5 strokes. */
function drawNight(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.bezierCurveTo(-w / 2, -h, w / 2, -h, w / 2, 0);
  ctx.stroke(); // 1: mound base
  ctx.beginPath();
  ctx.arc(0, -h * 1.05, h * 0.5, Math.PI * 0.15, Math.PI * 1.65);
  ctx.stroke(); // 2: crescent outer
  ctx.beginPath();
  ctx.arc(h * 0.18, -h * 1.05, h * 0.4, Math.PI * 0.2, Math.PI * 1.7);
  ctx.stroke(); // 3: crescent inner (carves the sliver)
  strokeSegments(ctx, [[-w * 0.3, -h * 1.4], [-w * 0.3, -h * 1.55]]); // 4: spark
  strokeSegments(ctx, [[w * 0.32, -h * 1.3], [w * 0.36, -h * 1.42]]); // 5: spark
}

/** "ghost" beast — rounded head, wavy hem, two eyes, a floaty "boo". 5 strokes. */
function drawGhost(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(-w / 2, -h * 0.5);
  ctx.quadraticCurveTo(-w / 2, -h * 1.3, 0, -h * 1.3);
  ctx.quadraticCurveTo(w / 2, -h * 1.3, w / 2, -h * 0.5);
  ctx.lineTo(w / 2, 0);
  ctx.stroke(); // 1: head + sides
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.quadraticCurveTo(w * 0.35, -h * 0.15, w * 0.2, 0);
  ctx.quadraticCurveTo(w * 0.05, -h * 0.15, -w * 0.1, 0);
  ctx.quadraticCurveTo(-w * 0.25, -h * 0.15, -w / 2, 0);
  ctx.stroke(); // 2: wavy hem
  strokeSegments(ctx, [[-w * 0.15, -h * 0.85], [-w * 0.15, -h * 0.75]]); // 3: eye
  strokeSegments(ctx, [[w * 0.1, -h * 0.85], [w * 0.1, -h * 0.75]]); // 4: eye
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, -h * 1.5);
  ctx.quadraticCurveTo(0, -h * 1.65, w * 0.15, -h * 1.5);
  ctx.stroke(); // 5: floaty squiggle
}

const OBSTACLE_DRAWERS: Record<Obstacle["kind"], (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  quiet: drawQuiet,
  "false-start": drawFalseStart,
  hill: drawHill,
  night: drawNight,
  ghost: drawGhost,
};

/** One obstacle's doodle glyph, drawn base-anchored at (x, groundY). */
export function drawObstacle(
  ctx: CanvasRenderingContext2D,
  obstacle: Obstacle,
  x: number,
  groundY: number,
  tokens: Tokens,
): void {
  // Visual size decoupled from the physical hitbox — see OBSTACLE_MIN_GLYPH_PX.
  const hPx = Math.max(obstacle.heightM * PX_PER_M, OBSTACLE_MIN_GLYPH_PX);
  const wPx = obstacle.widthM * (hPx / obstacle.heightM);
  ctx.save();
  ctx.translate(x, groundY);
  ctx.strokeStyle = tokens.ink;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  OBSTACLE_DRAWERS[obstacle.kind](ctx, wPx, hPx);
  ctx.restore();
}

/** The runner stick figure (adapted from living/reveal.ts's D1 runner: a
 *  circle head + torso + two legs + one arm) with legs alternating by the
 *  runner's own world-position phase — no wall-clock time involved, so the
 *  gait is exactly as deterministic as the physics driving `xM`. Airborne
 *  tucks both legs back rather than alternating. */
export function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  xM: number,
  tokens: Tokens,
  airborne: boolean,
): void {
  const phase = Math.sin((xM / RUNNER_STRIDE_M) * Math.PI * 2);

  ctx.save();
  ctx.translate(x, groundY);
  ctx.scale(RUNNER_LOCAL_SCALE, RUNNER_LOCAL_SCALE);
  ctx.strokeStyle = tokens.ink;
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(0, -8, 1.8, 0, Math.PI * 2);
  ctx.stroke(); // head

  strokeSegments(ctx, [[0, -6.2], [-1, -1]]); // torso

  if (airborne) {
    strokeSegments(ctx, [[-1, -1], [-4, 2]]); // back leg, tucked
    strokeSegments(ctx, [[-1, -1], [2, 2]]); // front leg, tucked
  } else if (phase >= 0) {
    strokeSegments(ctx, [[-1, -1], [-5, 4]]);
    strokeSegments(ctx, [[-1, -1], [4, 5]]);
  } else {
    strokeSegments(ctx, [[-1, -1], [-4, 5]]);
    strokeSegments(ctx, [[-1, -1], [5, 4]]);
  }

  strokeSegments(ctx, [[0, -4], [3, -5]]); // arm

  ctx.restore();
}

/** The Quiet: a paper-colored gradient wall from the left edge to the fog
 *  front, with a wobbled leading edge (stable per-row jitter, same
 *  determinism rule as the terrain) and faint eraser-crumb specks — the
 *  ONLY place Math.random is used in this file, and only as flourish
 *  (never gameplay state), disabled entirely under reduced motion. */
export function drawFog(
  ctx: CanvasRenderingContext2D,
  quietScreenX: number,
  tokens: Tokens,
  reducedMotion: boolean,
): void {
  if (quietScreenX <= 0) return;
  const w = Math.min(CANVAS_W, quietScreenX);

  ctx.save();
  ctx.fillStyle = tokens.paper;
  ctx.fillRect(0, 0, w, CANVAS_H);

  ctx.strokeStyle = tokens.inkFaint;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let first = true;
  for (let y = 0; y <= CANVAS_H; y += FOG_EDGE_SEGMENT_PX) {
    const row = Math.floor(y / FOG_EDGE_SEGMENT_PX);
    const x = w + segmentJitter("fog-edge", row, FOG_EDGE_JITTER_PX);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  if (!reducedMotion) {
    ctx.fillStyle = tokens.inkFaint;
    for (let i = 0; i < FOG_CRUMB_COUNT; i++) {
      const cx = w - Math.random() * FOG_CRUMB_SPREAD_PX;
      const cy = Math.random() * CANVAS_H;
      const r = 0.6 + Math.random() * 1.2;
      ctx.globalAlpha = 0.25 + Math.random() * 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export interface RenderParams {
  terrain: readonly TerrainPoint[];
  elevMin: number;
  elevMax: number;
  obstacles: readonly Obstacle[];
  state: GameState;
  tokens: Tokens;
  reducedMotion: boolean;
}

/** One frame of the live game: paper background, terrain, every
 *  (culled-to-viewport) obstacle, the runner, and the fog wall — in that
 *  back-to-front order. */
export function render(ctx: CanvasRenderingContext2D, params: RenderParams): void {
  const { terrain, elevMin, elevMax, obstacles, state, tokens, reducedMotion } = params;
  const vScale = verticalScale(elevMin, elevMax);
  const camera: Camera = { worldXM: state.xM };
  const cullMargin = 80;

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = tokens.paper;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawTerrain(ctx, terrain, camera, elevMin, vScale, tokens);

  for (const obstacle of obstacles) {
    const x = worldToScreenX(camera, obstacle.xM);
    if (x < -cullMargin || x > CANVAS_W + cullMargin) continue;
    const groundY = groundYAt(terrain, obstacle.xM, elevMin, vScale);
    drawObstacle(ctx, obstacle, x, groundY, tokens);
  }

  const runnerGroundY = groundYAt(terrain, state.xM, elevMin, vScale);
  const runnerY = runnerGroundY - state.yM * JUMP_VISUAL_PX_PER_M;
  drawRunner(ctx, RUNNER_SCREEN_X, runnerY, state.xM, tokens, !state.grounded);

  const quietScreenX = worldToScreenX(camera, state.quietXM);
  drawFog(ctx, quietScreenX, tokens, reducedMotion);
}

/** Idle attract frame: a preview of the terrain near the run's start, the
 *  runner standing (gently bobbing unless reduced motion), and the
 *  handwriting prompt. Never touches game state — purely decorative until
 *  the first jump input starts the real loop. */
export function drawAttract(
  ctx: CanvasRenderingContext2D,
  terrain: readonly TerrainPoint[],
  elevMin: number,
  elevMax: number,
  tokens: Tokens,
  reducedMotion: boolean,
  elapsedMs: number,
): void {
  const vScale = verticalScale(elevMin, elevMax);
  const camera: Camera = { worldXM: initialState().xM };

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = tokens.paper;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawTerrain(ctx, terrain, camera, elevMin, vScale, tokens);

  const groundY = groundYAt(terrain, camera.worldXM, elevMin, vScale);
  const bob = reducedMotion
    ? 0
    : Math.max(0, Math.sin((elapsedMs / ATTRACT_BOB_PERIOD_MS) * Math.PI * 2)) * ATTRACT_BOB_AMPLITUDE_PX;
  drawRunner(ctx, RUNNER_SCREEN_X, groundY - bob, camera.worldXM, tokens, false);

  ctx.save();
  ctx.fillStyle = tokens.ink;
  ctx.font = `20px ${HAND_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ATTRACT_TEXT, CANVAS_W / 2, CANVAS_H * 0.22);
  ctx.restore();
}
