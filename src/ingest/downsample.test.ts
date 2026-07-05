import { describe, it, expect } from "vitest";
import { downsample } from "./downsample";
import type { TrackPoint } from "./types";

function pt(lat: number, lon: number, i: number): TrackPoint {
  return { lat, lon, ele: 0, t: i * 1000 };
}

describe("downsample", () => {
  it("collapses collinear points to endpoints", () => {
    const pts = Array.from({ length: 50 }, (_, i) =>
      pt(19.0 + i * 0.0001, 72.9, i),
    );
    const out = downsample(pts, 8);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[49]);
  });

  it("keeps a significant corner", () => {
    const leg1 = Array.from({ length: 20 }, (_, i) => pt(19.0 + i * 0.0005, 72.9, i));
    const leg2 = Array.from({ length: 20 }, (_, i) => pt(19.0095, 72.9 + i * 0.0005, 20 + i));
    const out = downsample([...leg1, ...leg2], 8);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThan(10);
  });

  it("passes through tiny inputs unchanged", () => {
    const two = [pt(19, 72.9, 0), pt(19.1, 72.9, 1)];
    expect(downsample(two)).toEqual(two);
  });
});
