import { describe, it, expect } from "vitest";
import type { GameState } from "./physics";
import { initialState, step } from "./physics";
import type { Obstacle } from "./spawn";
import { hitTest } from "./spawn";

/**
 * The test that would have caught the original scale bug: proves the game's
 * core verb — jump — actually clears every obstacle kind under the REAL
 * physics `step()` and the REAL `hitTest`, and that running through without
 * jumping hits it (the converse).
 *
 * Takeoffs are COMPUTED per kind by exhaustive search over every candidate
 * takeoff tick in the approach (no shared magic tick): the count of clearing
 * takeoff ticks IS the player's input-timing window, asserted exactly —
 * deterministic physics makes these counts stable, and pinning them means
 * any future physics/size change that silently squeezes a window fails here
 * instead of in a player's hands. Windows (ticks / ms at 120 tps):
 * quiet 18/150ms, false-start 30/250ms, hill 10/83ms (the skill test),
 * night 17/142ms, ghost 17/142ms.
 */

const OBSTACLE_X = 200;
const TAKEOFF_SEARCH_TICKS = 400;

/** kind, widthM, heightM, expected clearing-takeoff window in ticks. */
const CASES: ReadonlyArray<[Obstacle["kind"], number, number, number]> = [
  ["quiet", 1.0, 0.4, 18],
  ["false-start", 0.7, 0.3, 30],
  ["hill", 1.4, 0.3, 10],
  ["night", 0.9, 0.5, 17],
  ["ghost", 0.7, 0.6, 17],
];

function mkObstacle(kind: Obstacle["kind"], widthM: number, heightM: number): Obstacle {
  return { xM: OBSTACLE_X, kind, widthM, heightM, name: `The ${kind}` };
}

/** Deterministic approach state, advanced (never jumping) to just before
 *  the obstacle — the search below then only has to cover the final
 *  approach, not the whole run-up from xM 40. */
function approachState(): GameState {
  let s = initialState();
  while (s.xM < OBSTACLE_X - 8) s = step(s, { jumpPressed: false });
  return s;
}

/** Runs the crossing from `base`, jumping exactly once at `takeoffOffset`
 *  ticks in (never, if negative). True = crossed the whole overlap window
 *  without hitTest ever returning the obstacle. */
function crossesClean(base: GameState, obstacle: Obstacle, takeoffOffset: number): boolean {
  let s = base;
  let t = 0;
  while (s.xM < OBSTACLE_X + 4 && s.alive) {
    s = step(s, { jumpPressed: t === takeoffOffset });
    if (hitTest(s.xM, s.yM, [obstacle]) !== null) return false;
    t++;
  }
  return true;
}

describe.each(CASES)("jumpable: %s (w %f, h %f)", (kind, widthM, heightM, expectedWindowTicks) => {
  const obstacle = mkObstacle(kind, widthM, heightM);
  const base = approachState();

  it("clears with a correctly-timed jump — hitTest stays null across the whole crossing", () => {
    const clearingTakeoffs: number[] = [];
    for (let off = 0; off < TAKEOFF_SEARCH_TICKS; off++) {
      if (crossesClean(base, obstacle, off)) clearingTakeoffs.push(off);
    }
    expect(clearingTakeoffs.length).toBeGreaterThan(0);
    // The full input-timing window, pinned exactly (deterministic physics).
    expect(clearingTakeoffs.length).toBe(expectedWindowTicks);
    // The window is one contiguous run of ticks — a fragmented window would
    // mean the arc grazes the obstacle mid-crossing somewhere inside it.
    const first = clearingTakeoffs[0]!;
    const last = clearingTakeoffs[clearingTakeoffs.length - 1]!;
    expect(last - first + 1).toBe(clearingTakeoffs.length);
  });

  it("hits when running through without jumping", () => {
    expect(crossesClean(base, obstacle, -1)).toBe(false);
  });
});
