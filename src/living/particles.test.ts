import { describe, it, expect } from "vitest";
import { specFor, spawn, step } from "./particles";
import type { ParticleSpec, P } from "./particles";

/** Deterministic LCG-based fake rand — same sequence every run, values in [0, 1). */
function seededRand(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Constant rand — every call returns the same value. Useful for pinning
 *  spawn output to exact bounds (0 -> lower bound, ~1 -> upper bound). */
function constantRand(value: number): () => number {
  return () => value;
}

describe("specFor", () => {
  it("returns the exact monsoon spec", () => {
    expect(specFor("monsoon")).toEqual<ParticleSpec>({
      count: 90,
      speedY: [140, 260],
      speedX: [-30, -10],
      size: [1, 2],
      alpha: [0.18, 0.35],
      flicker: false,
    });
  });

  it("returns the exact fireflies spec", () => {
    expect(specFor("fireflies")).toEqual<ParticleSpec>({
      count: 14,
      speedY: [-8, 8],
      speedX: [-12, 12],
      size: [1.5, 2.5],
      alpha: [0.05, 0.55],
      flicker: true,
    });
  });

  it("returns the exact leaves spec", () => {
    expect(specFor("leaves")).toEqual<ParticleSpec>({
      count: 18,
      speedY: [22, 50],
      speedX: [-25, 25],
      size: [2.5, 4.5],
      alpha: [0.25, 0.45],
      flicker: false,
    });
  });

  it("returns the exact snow spec", () => {
    expect(specFor("snow")).toEqual<ParticleSpec>({
      count: 45,
      speedY: [18, 40],
      speedX: [-12, 12],
      size: [1.5, 3],
      alpha: [0.25, 0.5],
      flicker: false,
    });
  });

  it("returns null for an unknown tag", () => {
    expect(specFor("blizzard")).toBeNull();
  });

  it("returns null for the empty string", () => {
    expect(specFor("")).toBeNull();
  });
});

describe("spawn", () => {
  const spec = specFor("fireflies")!;
  const w = 800;
  const h = 600;

  it("produces exactly spec.count particles", () => {
    const ps = spawn(spec, w, h, seededRand(1));
    expect(ps.length).toBe(spec.count);
  });

  it("pins every field to its lower bound when rand() always returns 0", () => {
    const ps = spawn(spec, w, h, constantRand(0));
    for (const p of ps) {
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
      expect(p.vx).toBe(spec.speedX[0]);
      expect(p.vy).toBe(spec.speedY[0]);
      expect(p.size).toBe(spec.size[0]);
      expect(p.alpha).toBe(spec.alpha[0]);
      expect(p.phase).toBe(0);
    }
  });

  it("pins every field to its upper bound when rand() always returns 1", () => {
    const ps = spawn(spec, w, h, constantRand(1));
    for (const p of ps) {
      expect(p.x).toBe(w);
      expect(p.y).toBe(h);
      expect(p.vx).toBe(spec.speedX[1]);
      expect(p.vy).toBe(spec.speedY[1]);
      expect(p.size).toBe(spec.size[1]);
      expect(p.alpha).toBe(spec.alpha[1]);
      expect(p.phase).toBeCloseTo(Math.PI * 2, 10);
    }
  });

  it("keeps every field within its spec range for a varying seeded rand", () => {
    const ps = spawn(spec, w, h, seededRand(42));
    expect(ps.length).toBe(spec.count);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(h);
      expect(p.vx).toBeGreaterThanOrEqual(spec.speedX[0]);
      expect(p.vx).toBeLessThanOrEqual(spec.speedX[1]);
      expect(p.vy).toBeGreaterThanOrEqual(spec.speedY[0]);
      expect(p.vy).toBeLessThanOrEqual(spec.speedY[1]);
      expect(p.size).toBeGreaterThanOrEqual(spec.size[0]);
      expect(p.size).toBeLessThanOrEqual(spec.size[1]);
      expect(p.alpha).toBeGreaterThanOrEqual(spec.alpha[0]);
      expect(p.alpha).toBeLessThanOrEqual(spec.alpha[1]);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it("is deterministic for the same rand sequence", () => {
    const a = spawn(spec, w, h, seededRand(7));
    const b = spawn(spec, w, h, seededRand(7));
    expect(a).toEqual(b);
  });

  it("respects count for a spec with a different count (monsoon)", () => {
    const monsoon = specFor("monsoon")!;
    const ps = spawn(monsoon, w, h, seededRand(3));
    expect(ps.length).toBe(90);
  });
});

describe("step", () => {
  const w = 400;
  const h = 300;

  function particle(overrides: Partial<P> = {}): P {
    return { x: 0, y: 0, vx: 0, vy: 0, size: 2, alpha: 0.3, phase: 0, ...overrides };
  }

  it("moves a particle by velocity * dt (dt-proportional, 1000ms = 1s)", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: 100, y: 100, vx: 20, vy: 30 });
    step([p], spec, w, h, 1000);
    expect(p.x).toBeCloseTo(120, 6);
    expect(p.y).toBeCloseTo(130, 6);
  });

  it("moves proportionally less for half the dt", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: 100, y: 100, vx: 20, vy: 30 });
    step([p], spec, w, h, 500);
    expect(p.x).toBeCloseTo(110, 6);
    expect(p.y).toBeCloseTo(115, 6);
  });

  it("wraps a particle that exits past the right edge back onto the left side", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: w - 5, y: 100, vx: 100, vy: 0 }); // moves 100px/s
    step([p], spec, w, h, 1000); // x would be w + 95
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThan(w);
    expect(p.x).toBeCloseTo(95, 6);
  });

  it("wraps a particle that exits past the left edge back onto the right side", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: 5, y: 100, vx: -100, vy: 0 });
    step([p], spec, w, h, 1000); // x would be -95
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThan(w);
    expect(p.x).toBeCloseTo(w - 95, 6);
  });

  it("wraps a particle that exits past the bottom edge back to the top", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: 100, y: h - 5, vx: 0, vy: 100 });
    step([p], spec, w, h, 1000); // y would be h + 95
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThan(h);
    expect(p.y).toBeCloseTo(95, 6);
  });

  it("wraps a particle that exits past the top edge back to the bottom", () => {
    const spec = specFor("snow")!;
    const p = particle({ x: 100, y: 5, vx: 0, vy: -100 });
    step([p], spec, w, h, 1000); // y would be -95
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThan(h);
    expect(p.y).toBeCloseTo(h - 95, 6);
  });

  it("keeps alpha constant across steps for a non-flicker spec", () => {
    const spec = specFor("leaves")!;
    const p = particle({ alpha: 0.33 });
    step([p], spec, w, h, 16);
    step([p], spec, w, h, 16);
    step([p], spec, w, h, 16);
    expect(p.alpha).toBe(0.33);
  });

  it("oscillates alpha within [min, max] for a flicker spec, never constant across steps", () => {
    const spec = specFor("fireflies")!; // flicker: true, alpha [0.05, 0.55]
    const p = particle({ alpha: 0.3, phase: 0 });
    const seen = new Set<number>();
    for (let i = 0; i < 50; i++) {
      step([p], spec, w, h, 33);
      expect(p.alpha).toBeGreaterThanOrEqual(spec.alpha[0] - 1e-9);
      expect(p.alpha).toBeLessThanOrEqual(spec.alpha[1] + 1e-9);
      seen.add(Math.round(p.alpha * 1000));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("advances phase over time for a flicker spec", () => {
    const spec = specFor("fireflies")!;
    const p = particle({ phase: 0 });
    step([p], spec, w, h, 100);
    expect(p.phase).not.toBe(0);
  });

  it("does not mutate the spec passed in", () => {
    const spec = specFor("snow")!;
    const before = JSON.parse(JSON.stringify(spec));
    const p = particle({ x: 10, y: 10, vx: 5, vy: 5 });
    step([p], spec, w, h, 250);
    expect(spec).toEqual(before);
  });

  it("mutates an array of multiple particles independently", () => {
    const spec = specFor("snow")!;
    const p1 = particle({ x: 10, vx: 10 });
    const p2 = particle({ x: 200, vx: -10 });
    step([p1, p2], spec, w, h, 1000);
    expect(p1.x).toBeCloseTo(20, 6);
    expect(p2.x).toBeCloseTo(190, 6);
  });
});
