import type { BeastEntry } from "../storytell/types";
import type { Rng } from "../storytell/rng";

/** A single obstacle placed along the run: drawn from the player's own book
 *  beasts (cycled), positioned deterministically along the game track. */
export interface Obstacle {
  xM: number;
  kind: BeastEntry["kind"];
  widthM: number;
  heightM: number;
  name: string;
}

/** Runner hitbox (game-meters): w 0.6, h 1.8 (a person-sized runner). Only
 *  width matters for the horizontal overlap test; the vertical clearance
 *  rule uses yM against the obstacle's own height directly (see hitTest
 *  below), not the runner's body height. */
const RUNNER_WIDTH_M = 0.6;

const FIRST_OBSTACLE_XM = 160;
const GAP_MIN_M = 90;
const GAP_MAX_M = 220;
const END_MARGIN_M = 100;

/** Physical hitbox footprint per beast kind, in REAL game-meters, tuned to
 *  the jump arc so every kind is actually clearable (the original values
 *  here were authored at doodle-glyph scale — 6-16m tall — and nothing was
 *  jumpable; draw.ts now deliberately decouples the drawn glyph size from
 *  these honest hitboxes).
 *
 *  The clearance math (see jumpable.test.ts for the executable proof):
 *  - Jump apex = JUMP_V^2 / (2*GRAVITY) ~= 1.18m analytic, ~1.148m under
 *    the discrete 120Hz integration; total air distance ~= 2.73m at
 *    RUN_SPEED (airtime 2*JUMP_V/GRAVITY ~= 0.65s).
 *  - Clearing requires yM >= heightM for the ENTIRE horizontal overlap
 *    window, which is (widthM + runner 0.6m) wide — NOT merely being
 *    airborne over the center.
 *  - The arc spends only airDist * sqrt(1 - h/apex) meters above height h,
 *    so height and width trade off hard: h near the apex leaves almost no
 *    horizontal clearance at all.
 *  Each entry below leaves a verified input-timing window (exhaustive
 *  per-takeoff-tick search in jumpable.test.ts): quiet 18 ticks (150ms),
 *  false-start 30 (250ms), hill 10 (83ms — the skill test), night 17
 *  (142ms), ghost 17 (142ms). */
const SIZE_BY_KIND: Record<BeastEntry["kind"], { widthM: number; heightM: number }> = {
  quiet: { widthM: 1.0, heightM: 0.4 },
  "false-start": { widthM: 0.7, heightM: 0.3 },
  hill: { widthM: 1.4, heightM: 0.3 },
  night: { widthM: 0.9, heightM: 0.5 },
  ghost: { widthM: 0.7, heightM: 0.6 },
};

const FALLBACK_KIND: BeastEntry["kind"] = "false-start";
const FALLBACK_NAME = "A Pebble of Doubt";

/** Deterministic layout: fork rng with "game:spawn". Obstacles are drawn from
 *  the book's beasts, cycling through them in order as the track advances.
 *  First obstacle sits at xM 160; each subsequent gap is drawn uniformly from
 *  [90, 220] via the forked rng. Placement stops once xM would exceed
 *  terrainLengthM - 100 (obstacles never crowd the very end of the run).
 *  A book with zero beasts falls back to generic "pebble" obstacles of kind
 *  "false-start" named "A Pebble of Doubt", keeping the same spawn rhythm. */
export function spawnObstacles(
  rng: Rng,
  beasts: readonly BeastEntry[],
  terrainLengthM: number,
): Obstacle[] {
  const spawnRng = rng.fork("game:spawn");
  const obstacles: Obstacle[] = [];
  const limit = terrainLengthM - END_MARGIN_M;

  let xM = FIRST_OBSTACLE_XM;
  let i = 0;
  while (xM <= limit) {
    const beast = beasts.length > 0 ? beasts[i % beasts.length]! : null;
    const kind = beast ? beast.kind : FALLBACK_KIND;
    const name = beast ? beast.name : FALLBACK_NAME;
    const size = SIZE_BY_KIND[kind];
    obstacles.push({ xM, kind, widthM: size.widthM, heightM: size.heightM, name });

    const gap = GAP_MIN_M + spawnRng.next() * (GAP_MAX_M - GAP_MIN_M);
    xM += gap;
    i += 1;
  }

  return obstacles;
}

/** AABB-ish overlap test: the runner (body width 0.6, height 1.8, positioned
 *  at xM with vertical offset yM above ground) hits an obstacle when their
 *  horizontal spans overlap AND yM < obstacle.heightM (a high enough jump
 *  clears it clean). Returns the obstacle hit, or null if the runner is
 *  clear of everything. */
export function hitTest(xM: number, yM: number, obstacles: readonly Obstacle[]): Obstacle | null {
  const runnerLeft = xM - RUNNER_WIDTH_M / 2;
  const runnerRight = xM + RUNNER_WIDTH_M / 2;

  for (const obstacle of obstacles) {
    const obstacleLeft = obstacle.xM - obstacle.widthM / 2;
    const obstacleRight = obstacle.xM + obstacle.widthM / 2;
    const overlapsHorizontally = runnerLeft < obstacleRight && runnerRight > obstacleLeft;
    if (overlapsHorizontally && yM < obstacle.heightM) return obstacle;
  }
  return null;
}

/** Obstacles the fog front has already swallowed are gone for good — once The
 *  Quiet has passed an obstacle's position there is no double jeopardy from
 *  something the fog already erased.
 *  Deliberate: keyed on the obstacle's RIGHT EDGE (xM + widthM/2), not its
 *  center, consistent with hitTest geometry — an obstacle stays alive while
 *  any part of it is still ahead of the fog (it shouldn't vanish half-drawn). */
export function alive(obstacles: readonly Obstacle[], quietXM: number): Obstacle[] {
  return obstacles.filter((o) => o.xM + o.widthM / 2 > quietXM);
}
