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

/** Runner hitbox (game-meters). Only width matters for the horizontal overlap
 *  test; the vertical clearance rule uses yM against the obstacle's own
 *  height directly (see hitTest below), not the runner's body height. */
const RUNNER_WIDTH_M = 6;

const FIRST_OBSTACLE_XM = 160;
const GAP_MIN_M = 90;
const GAP_MAX_M = 220;
const END_MARGIN_M = 100;

/** Fixed footprint per beast kind — matches the doodle silhouette. */
const SIZE_BY_KIND: Record<BeastEntry["kind"], { widthM: number; heightM: number }> = {
  quiet: { widthM: 18, heightM: 10 },
  "false-start": { widthM: 8, heightM: 6 },
  hill: { widthM: 26, heightM: 16 },
  night: { widthM: 14, heightM: 12 },
  ghost: { widthM: 12, heightM: 14 },
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

/** AABB-ish overlap test: the runner (body width 6, height 10, positioned at
 *  xM with vertical offset yM above ground) hits an obstacle when their
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
