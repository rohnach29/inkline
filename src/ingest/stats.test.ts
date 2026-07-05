import { describe, it, expect } from "vitest";
import { haversineM, trackStats } from "./stats";
import type { TrackPoint } from "./types";

describe("haversineM", () => {
  it("measures ~111 km per degree of latitude", () => {
    const d = haversineM({ lat: 19.0, lon: 72.9 }, { lat: 20.0, lon: 72.9 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("trackStats", () => {
  it("sums distance, duration from timestamps, and positive elevation only", () => {
    const t0 = Date.parse("2025-01-01T06:00:00Z");
    const pts: TrackPoint[] = [
      { lat: 19.0, lon: 72.9, ele: 10, t: t0 },
      { lat: 19.001, lon: 72.9, ele: 14, t: t0 + 30_000 },
      { lat: 19.002, lon: 72.9, ele: 12, t: t0 + 60_000 },
    ];
    const s = trackStats(pts);
    expect(s.km).toBeCloseTo(0.221, 2); // 2 × ~110.6 m
    expect(s.minutes).toBe(1);
    expect(s.elevationGain).toBe(4); // +4 up, -2 down ignored
  });

  it("returns zeros for fewer than 2 points", () => {
    expect(trackStats([])).toEqual({ km: 0, minutes: 0, elevationGain: 0 });
  });

  it("returns zeros for a single point", () => {
    const pts: TrackPoint[] = [{ lat: 19.0, lon: 72.9, ele: 10, t: 0 }];
    expect(trackStats(pts)).toEqual({ km: 0, minutes: 0, elevationGain: 0 });
  });
});
