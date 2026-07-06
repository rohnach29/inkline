import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { hatchFill, pointInPolygon, scribbleFill } from "./fills";
import type { Pt } from "./types";

const SQUARE: Pt[] = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }];
const coords = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

describe("pointInPolygon", () => {
  it("classifies inside/outside", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 50 }, SQUARE)).toBe(false);
  });
});

describe("scribbleFill", () => {
  it("is deterministic and stays inside the blob (±2 units)", () => {
    const a = scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f"));
    expect(a).toBe(scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f")));
    for (const p of coords(a)) {
      expect(p.x).toBeGreaterThan(18);
      expect(p.x).toBeLessThan(82);
      expect(p.y).toBeGreaterThan(18);
      expect(p.y).toBeLessThan(82);
    }
  });
  it("is one connected path (single M)", () => {
    const d = scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f"));
    expect(d.match(/M/g)!.length).toBe(1);
  });
});

describe("hatchFill", () => {
  it("emits separate segments, all inside (±2 units)", () => {
    const ds = hatchFill(SQUARE, 6, Math.PI / 4, new Rng(4).fork("h"));
    expect(ds.length).toBeGreaterThan(3);
    for (const d of ds) for (const p of coords(d)) {
      expect(p.x).toBeGreaterThan(18);
      expect(p.x).toBeLessThan(82);
      expect(p.y).toBeGreaterThan(18);
      expect(p.y).toBeLessThan(82);
    }
  });
});
