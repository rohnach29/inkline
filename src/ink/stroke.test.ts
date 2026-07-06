import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { resample, strokePath } from "./stroke";
import type { Pt } from "./types";

const line = (n: number): Pt[] => Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 100 }));

/** every coordinate pair in a path d string */
const coords = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

describe("resample", () => {
  it("spaces points evenly along the polyline", () => {
    const pts = resample(line(6), 3);
    for (let i = 1; i < pts.length - 1; i++) {
      const dst = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(dst).toBeGreaterThan(1.5);
      expect(dst).toBeLessThan(4.5);
    }
  });
  it("keeps endpoints", () => {
    const pts = resample(line(6), 3);
    expect(pts[0]).toEqual({ x: 0, y: 100 });
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(last.x - 100, last.y - 100)).toBeLessThan(1);
  });
});

describe("strokePath", () => {
  it("is deterministic for the same rng seed", () => {
    const a = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    const b = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    expect(a).toBe(b);
  });
  it("differs across seeds (wobble is live)", () => {
    const a = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    const b = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(8).fork("s"));
    expect(a).not.toBe(b);
  });
  it("bounds wobble displacement under 2.5 units even when asked for more", () => {
    const d = strokePath(line(12), "centerline", { wobble: 9 }, new Rng(3).fork("w"));
    for (const p of coords(d)) expect(Math.abs(p.y - 100)).toBeLessThan(2.5);
  });
  it("pins endpoints (skeleton joints stay joined)", () => {
    const d = strokePath(line(12), "centerline", { wobble: 2 }, new Rng(5).fork("p"));
    const pts = coords(d);
    expect(Math.abs(pts[0]!.y - 100)).toBeLessThan(0.01);
  });
  it("outline mode emits a closed filled shape", () => {
    const d = strokePath(line(6), "outline", { width: 3 }, new Rng(2).fork("o"));
    expect(d.trim().endsWith("Z")).toBe(true);
    const ys = coords(d).map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(100);
    expect(Math.min(...ys)).toBeLessThan(100); // both sides of the centerline
  });
  it("overshoot extends past the last point", () => {
    const d = strokePath(line(6), "centerline", { wobble: 0, overshoot: 6 }, new Rng(1).fork("v"));
    const xs = coords(d).map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(103);
  });
});
