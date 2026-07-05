import { describe, it, expect } from "vitest";
import { Rng } from "../storytell/rng";
import type { BeastEntry } from "../storytell/types";
import { spawnObstacles, hitTest, alive } from "./spawn";

function mkBeast(partial: Partial<BeastEntry> & { name: string; kind: BeastEntry["kind"] }): BeastEntry {
  return {
    description: partial.description ?? "a beast",
    doodleTag: partial.doodleTag ?? "ghost",
    ...partial,
  };
}

const BEASTS: BeastEntry[] = [
  mkBeast({ name: "The Long Quiet", kind: "quiet" }),
  mkBeast({ name: "Tuesday's Banana", kind: "false-start" }),
  mkBeast({ name: "The Hill of Record", kind: "hill" }),
  mkBeast({ name: "Nightfall", kind: "night" }),
  mkBeast({ name: "The Ghost Summit", kind: "ghost" }),
];

describe("spawnObstacles", () => {
  it("is deterministic for the same rng seed", () => {
    const a = spawnObstacles(new Rng(42), BEASTS, 5000);
    const b = spawnObstacles(new Rng(42), BEASTS, 5000);
    expect(a).toEqual(b);
  });

  it("differs for a different rng seed", () => {
    const a = spawnObstacles(new Rng(42), BEASTS, 5000);
    const b = spawnObstacles(new Rng(43), BEASTS, 5000);
    expect(a).not.toEqual(b);
  });

  it("places the first obstacle at xM 160", () => {
    const obstacles = spawnObstacles(new Rng(1), BEASTS, 5000);
    expect(obstacles[0]!.xM).toBe(160);
  });

  it("draws every gap between consecutive obstacles from [90, 220]", () => {
    const obstacles = spawnObstacles(new Rng(7), BEASTS, 5000);
    expect(obstacles.length).toBeGreaterThan(2);
    for (let i = 1; i < obstacles.length; i++) {
      const gap = obstacles[i]!.xM - obstacles[i - 1]!.xM;
      expect(gap).toBeGreaterThanOrEqual(90);
      expect(gap).toBeLessThanOrEqual(220);
    }
  });

  it("stops placing obstacles before terrainLength - 100", () => {
    const terrainLengthM = 1000;
    const obstacles = spawnObstacles(new Rng(3), BEASTS, terrainLengthM);
    for (const o of obstacles) {
      expect(o.xM).toBeLessThanOrEqual(terrainLengthM - 100);
    }
  });

  it("produces no obstacles when the runway is too short for even one", () => {
    const obstacles = spawnObstacles(new Rng(3), BEASTS, 200);
    expect(obstacles).toEqual([]);
  });

  it("falls back to generically-named pebbles when the book has zero beasts", () => {
    const obstacles = spawnObstacles(new Rng(9), [], 5000);
    expect(obstacles.length).toBeGreaterThan(0);
    for (const o of obstacles) {
      expect(o.kind).toBe("false-start");
      expect(o.name).toBe("A Pebble of Doubt");
    }
    // same rhythm as the beast-driven path: first at 160, gaps in range
    expect(obstacles[0]!.xM).toBe(160);
  });

  it("cycles through the book's beasts in order, repeating past the end", () => {
    const twoBeasts = BEASTS.slice(0, 2);
    const obstacles = spawnObstacles(new Rng(11), twoBeasts, 5000);
    expect(obstacles.length).toBeGreaterThan(2);
    obstacles.forEach((o, i) => {
      expect(o.name).toBe(twoBeasts[i % 2]!.name);
    });
  });

  it("assigns exact sizes per kind", () => {
    const sizeByName = new Map(
      spawnObstacles(new Rng(5), BEASTS, 5000).map((o) => [o.kind, o]),
    );
    expect(sizeByName.get("quiet")).toMatchObject({ widthM: 1.0, heightM: 0.4 });
    expect(sizeByName.get("false-start")).toMatchObject({ widthM: 0.7, heightM: 0.3 });
    expect(sizeByName.get("hill")).toMatchObject({ widthM: 1.4, heightM: 0.3 });
    expect(sizeByName.get("night")).toMatchObject({ widthM: 0.9, heightM: 0.5 });
    expect(sizeByName.get("ghost")).toMatchObject({ widthM: 0.7, heightM: 0.6 });
  });
});

describe("hitTest", () => {
  const obstacle = { xM: 200, kind: "hill" as const, widthM: 1.4, heightM: 0.3, name: "The Hill of Record" };

  it("returns the obstacle when the grounded runner overlaps it", () => {
    expect(hitTest(200, 0, [obstacle])).toBe(obstacle);
  });

  it("returns null when the runner jumps above the obstacle's height", () => {
    expect(hitTest(200, 0.5, [obstacle])).toBeNull();
  });

  it("returns null when the runner does not overlap horizontally", () => {
    expect(hitTest(500, 0, [obstacle])).toBeNull();
  });

  it("returns null when yM equals heightM exactly (jump clears at the boundary)", () => {
    // hitTest requires yM < heightM strictly; yM === heightM is a clean clear.
    expect(hitTest(200, 0.3, [obstacle])).toBeNull();
  });

  it("returns null when the runner's right edge exactly touches the obstacle's left edge", () => {
    // Strict inequalities in hitTest: edge-touching (runnerRight === obstacleLeft)
    // does NOT count as overlap. Runner half-width 0.3, obstacle left edge at
    // 200 - 1.4/2 = 199.3, so a runner at xM 199.0 touches without hitting.
    expect(hitTest(199.0, 0, [obstacle])).toBeNull();
    // one hair further along and it IS a hit
    expect(hitTest(199.01, 0, [obstacle])).toBe(obstacle);
  });
});

describe("alive", () => {
  it("drops obstacles the fog front has already swallowed", () => {
    const obstacles = [
      { xM: 100, kind: "false-start" as const, widthM: 8, heightM: 6, name: "A" },
      { xM: 300, kind: "false-start" as const, widthM: 8, heightM: 6, name: "B" },
    ];
    const survivors = alive(obstacles, 200);
    expect(survivors).toHaveLength(1);
    expect(survivors[0]!.name).toBe("B");
  });

  it("keeps an obstacle whose center is behind the fog but whose right edge is still ahead", () => {
    // Pins the deliberate right-edge rule (vs the center-point reading):
    // center 195 < quietXM 200, but right edge 195 + 20/2 = 205 > 200 → alive.
    const halfSwallowed = { xM: 195, kind: "hill" as const, widthM: 20, heightM: 16, name: "H" };
    expect(alive([halfSwallowed], 200)).toEqual([halfSwallowed]);
    // fully swallowed once the fog passes the right edge
    expect(alive([halfSwallowed], 205)).toEqual([]);
  });
});
