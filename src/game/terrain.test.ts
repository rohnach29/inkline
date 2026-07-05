import { describe, it, expect } from "vitest";
import type { Run, TrackPoint } from "../ingest";
import { haversineM } from "../ingest";
import { stitchTerrain, elevAt, terrainLengthM } from "./terrain";

/** Synthetic-track helper matching the analyze-test convention: points 1s apart. */
function mkTrack(points: readonly [number, number, number][], startT: number): TrackPoint[] {
  return points
    .map(([lat, lon, ele]) => ({ lat, lon, ele, t: startT }))
    .map((p, i) => ({ ...p, t: startT + i * 1000 }));
}

const EARTH_R_M = 6_371_000;
function metersLat(m: number): number {
  return (m / EARTH_R_M) * (180 / Math.PI);
}

function mkRun(partial: Partial<Run> & { startLocal: string }): Run {
  const startUtc = partial.startUtc ?? Date.parse(`${partial.startLocal}Z`);
  return {
    id: partial.id ?? partial.startLocal,
    startUtc,
    startLocal: partial.startLocal,
    tz: partial.tz ?? "UTC",
    timezoneUncertain: partial.timezoneUncertain ?? false,
    km: partial.km ?? 5,
    minutes: partial.minutes ?? 30,
    elevationGain: partial.elevationGain ?? 20,
    indoor: partial.indoor ?? false,
    track: partial.track,
    placeId: partial.placeId ?? null,
  };
}

describe("stitchTerrain", () => {
  it("produces strictly increasing xM across two runs", () => {
    const run1 = mkRun({
      id: "r1",
      startLocal: "2025-01-01T08:00:00",
      track: mkTrack(
        [
          [0, 0, 10],
          [0, metersLat(500), 60],
        ],
        0,
      ),
    });
    const run2 = mkRun({
      id: "r2",
      startLocal: "2025-01-02T08:00:00",
      track: mkTrack(
        [
          [10, 10, 500],
          [10, 10 + metersLat(300), 520],
        ],
        0,
      ),
    });
    const terrain = stitchTerrain([run1, run2]);
    expect(terrain.length).toBeGreaterThan(2);
    for (let i = 1; i < terrain.length; i++) {
      expect(terrain[i]!.xM).toBeGreaterThan(terrain[i - 1]!.xM);
    }
  });

  it("re-bases the second run's elevation onto the first run's end (no cliffs)", () => {
    const run1 = mkRun({
      id: "r1",
      startLocal: "2025-01-01T08:00:00",
      track: mkTrack(
        [
          [0, 0, 10],
          [0, metersLat(500), 60], // run1 ends at elevM 60
        ],
        0,
      ),
    });
    const run2 = mkRun({
      id: "r2",
      startLocal: "2025-01-02T08:00:00",
      track: mkTrack(
        [
          [10, 10, 500], // run2's OWN first ele is 500 (a "cliff" if not rebased)
          [10, 10 + metersLat(300), 520], // run2 climbs 20m internally
        ],
        0,
      ),
    });
    const terrain = stitchTerrain([run1, run2]);
    // No point in the stitched output should read the raw 500/520 values.
    for (const p of terrain) {
      expect(p.elevM).not.toBe(500);
      expect(p.elevM).not.toBe(520);
    }
    // The last point (run2's rebased end) must continue from run1's end (60)
    // plus run2's internal 20m gain -> 80. The bridge/lead-in points read 60.
    const last = terrain[terrain.length - 1]!;
    expect(last.elevM).toBeCloseTo(80, 5);
    // Somewhere the profile passes through the rebased run1-end value (60),
    // proving the cliff (60 -> 500) never appears.
    expect(terrain.some((p) => Math.abs(p.elevM - 60) < 1e-6)).toBe(true);
  });

  it("inserts a flat 200m bridge between runs at the previous run's final elevation", () => {
    const run1 = mkRun({
      id: "r1",
      startLocal: "2025-01-01T08:00:00",
      track: mkTrack(
        [
          [0, 0, 10],
          [0, metersLat(500), 60],
        ],
        0,
      ),
    });
    const run2 = mkRun({
      id: "r2",
      startLocal: "2025-01-02T08:00:00",
      track: mkTrack(
        [
          [10, 10, 500],
          [10, 10 + metersLat(300), 520],
        ],
        0,
      ),
    });
    const terrain = stitchTerrain([run1, run2]);
    // Find a pair of consecutive points 200m apart with identical elevation
    // (the flat rest-day bridge).
    let foundBridge = false;
    for (let i = 1; i < terrain.length; i++) {
      const a = terrain[i - 1]!;
      const b = terrain[i]!;
      if (Math.abs(b.xM - a.xM - 200) < 1e-6 && Math.abs(b.elevM - a.elevM) < 1e-9) {
        foundBridge = true;
      }
    }
    expect(foundBridge).toBe(true);
  });

  it("skips runs without a track or with fewer than 2 points", () => {
    const good = mkRun({
      id: "good",
      startLocal: "2025-01-01T08:00:00",
      track: mkTrack(
        [
          [0, 0, 10],
          [0, metersLat(500), 60],
        ],
        0,
      ),
    });
    const noTrack = mkRun({ id: "no-track", startLocal: "2025-01-02T08:00:00" });
    const onePoint = mkRun({
      id: "one-point",
      startLocal: "2025-01-03T08:00:00",
      track: mkTrack([[5, 5, 100]], 0),
    });
    const terrainWithSkips = stitchTerrain([good, noTrack, onePoint]);
    const terrainSoloGood = stitchTerrain([good]);
    // Trackless/degenerate runs contribute nothing -- output is identical to
    // stitching the good run alone (no bridge inserted for skipped runs).
    expect(terrainWithSkips).toEqual(terrainSoloGood);
  });

  it("returns the exact flat default segment for empty input", () => {
    expect(stitchTerrain([])).toEqual([
      { xM: 0, elevM: 0 },
      { xM: 2000, elevM: 0 },
    ]);
  });

  it("returns the exact flat default segment when every run is skipped", () => {
    const onlyTrackless = mkRun({ id: "no-track", startLocal: "2025-01-01T08:00:00" });
    expect(stitchTerrain([onlyTrackless])).toEqual([
      { xM: 0, elevM: 0 },
      { xM: 2000, elevM: 0 },
    ]);
  });

  it("uses real haversine distance to advance xM within a run", () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, metersLat(500)];
    const run = mkRun({
      id: "r1",
      startLocal: "2025-01-01T08:00:00",
      track: mkTrack([[...a, 10], [...b, 60]], 0),
    });
    const terrain = stitchTerrain([run]);
    const expectedDist = haversineM({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });
    expect(terrain[1]!.xM - terrain[0]!.xM).toBeCloseTo(expectedDist, 5);
  });
});

describe("elevAt", () => {
  const terrain = [
    { xM: 0, elevM: 0 },
    { xM: 100, elevM: 50 },
    { xM: 300, elevM: 30 },
  ];

  it("interpolates linearly at a midpoint", () => {
    expect(elevAt(terrain, 50)).toBeCloseTo(25, 5);
    expect(elevAt(terrain, 200)).toBeCloseTo(40, 5);
  });

  it("returns exact values at known points", () => {
    expect(elevAt(terrain, 0)).toBe(0);
    expect(elevAt(terrain, 100)).toBe(50);
    expect(elevAt(terrain, 300)).toBe(30);
  });

  it("clamps below the first point", () => {
    expect(elevAt(terrain, -50)).toBe(0);
  });

  it("clamps beyond the last point", () => {
    expect(elevAt(terrain, 1000)).toBe(30);
  });
});

describe("terrainLengthM", () => {
  it("returns the distance from first to last point", () => {
    const terrain = [
      { xM: 0, elevM: 0 },
      { xM: 100, elevM: 50 },
      { xM: 300, elevM: 30 },
    ];
    expect(terrainLengthM(terrain)).toBe(300);
  });

  it("returns 0 for a single-point terrain", () => {
    expect(terrainLengthM([{ xM: 42, elevM: 5 }])).toBe(0);
  });

  it("returns 2000 for the default empty-input segment", () => {
    expect(terrainLengthM(stitchTerrain([]))).toBe(2000);
  });
});
