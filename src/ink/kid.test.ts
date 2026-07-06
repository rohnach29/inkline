import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { kidStrokes, type KidPose } from "./kid";

const POSES: KidPose[] = ["running", "collapsed", "climbing", "sleeping", "looking-up", "dragging", "mid-air"];

describe("kidStrokes", () => {
  it("renders every pose deterministically with sane stroke counts", () => {
    for (const pose of POSES) {
      const a = kidStrokes(pose, { x: 120, y: 160 }, new Rng(11).fork(pose), 0);
      const b = kidStrokes(pose, { x: 120, y: 160 }, new Rng(11).fork(pose), 0);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(8); // head, hair, eye, nose, torso, 2+ limbs, 2 feet
      expect(a.length).toBeLessThan(60);
      for (const s of a) expect(s.d.length).toBeGreaterThan(0);
    }
  });
  it("orders strokes sequentially from orderBase", () => {
    const s = kidStrokes("running", { x: 120, y: 160 }, new Rng(1).fork("r"), 100);
    expect(Math.min(...s.map((x) => x.order))).toBe(100);
    const orders = s.map((x) => x.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
  it("flip mirrors x around the anchor", () => {
    const norm = kidStrokes("running", { x: 120, y: 160 }, new Rng(1).fork("r"), 0);
    const flip = kidStrokes("running", { x: 120, y: 160, flip: true }, new Rng(1).fork("r"), 0);
    expect(flip).not.toEqual(norm);
  });
});
