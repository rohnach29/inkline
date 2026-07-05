import { describe, it, expect } from "vitest";
import type { Run, TrackPoint, Year } from "../ingest";
import {
  clusterRoutes,
  detectRouteChampion,
  detectHill,
  detectHillBeast,
  detectGhosts,
  detectJourneys,
} from "./geo";
import { analyzeYear } from "./index";

/** Synthetic-track helper required by the brief: points are 1s apart. */
function mkTrack(points: readonly [number, number, number][], startT: number): TrackPoint[] {
  return points.map(([lat, lon, ele]) => ({ lat, lon, ele, t: startT }))
    .map((p, i) => ({ ...p, t: startT + i * 1000 }));
}

/** Exact meters -> lat-degree conversion consistent with haversineM's sphere
 * model (R = 6,371,000m), so haversineM(origin, offset-by-metersLat(m)) === m
 * up to floating point precision. Keeps hill length/grade assertions exact. */
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

function mkYear(runs: Run[]): Year {
  const utcs = runs.map((r) => r.startUtc);
  return {
    runs,
    places: [],
    span: {
      firstUtc: utcs.length ? Math.min(...utcs) : 0,
      lastUtc: utcs.length ? Math.max(...utcs) : 0,
    },
  };
}

const EMPTY_YEAR: Year = { runs: [], places: [], span: { firstUtc: 0, lastUtc: 0 } };

describe("clusterRoutes", () => {
  it("clusters two identical-path runs together", () => {
    const path: [number, number, number][] = [
      [10, 10, 0],
      [10.001, 10.001, 0],
      [10.002, 10.002, 0],
    ];
    const run1 = mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mkTrack(path, 0) });
    const run2 = mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: mkTrack(path, 0) });
    const clusters = clusterRoutes(mkYear([run1, run2]));
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.seedRunId).toBe("r1");
    expect(clusters[0]!.runIds).toEqual(["r1", "r2"]);
  });

  it("starts a new cluster for a run 10km away", () => {
    const path: [number, number, number][] = [
      [10, 10, 0],
      [10.001, 10.001, 0],
    ];
    const farPath: [number, number, number][] = [
      [10.1, 10, 0], // ~11km north
      [10.101, 10.001, 0],
    ];
    const run1 = mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mkTrack(path, 0) });
    const run2 = mkRun({
      id: "r2",
      startLocal: "2025-01-02T08:00:00",
      track: mkTrack(farPath, 0),
    });
    const clusters = clusterRoutes(mkYear([run1, run2]));
    expect(clusters).toHaveLength(2);
    expect(clusters[0]!.seedRunId).toBe("r1");
    expect(clusters[1]!.seedRunId).toBe("r2");
  });

  it("ignores runs without a track", () => {
    const run1 = mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00" });
    expect(clusterRoutes(mkYear([run1]))).toEqual([]);
  });

  it("returns [] for an empty year", () => {
    expect(clusterRoutes(EMPTY_YEAR)).toEqual([]);
  });
});

describe("detectRouteChampion", () => {
  const path: [number, number, number][] = [
    [10, 10, 0],
    [10.001, 10.001, 0],
  ];

  it("emits nothing when the largest cluster has fewer than 3 runs", () => {
    const run1 = mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mkTrack(path, 0) });
    const run2 = mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: mkTrack(path, 0) });
    expect(detectRouteChampion(mkYear([run1, run2]))).toEqual([]);
  });

  it("emits route-champion for a cluster with >= 3 runs", () => {
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", km: 5, track: mkTrack(path, 0) }),
      mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: mkTrack(path, 0) }),
      mkRun({ id: "r3", startLocal: "2025-01-03T08:00:00", track: mkTrack(path, 0) }),
    ];
    const events = detectRouteChampion(mkYear(runs));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "route-champion",
      runIds: ["r1", "r2", "r3"],
      atUtc: runs[0]!.startUtc,
      magnitude: 3,
      data: { count: 3, seedRunId: "r1", km: 5 },
    });
  });
});

describe("detectHill", () => {
  it("detects a monotonic 50m climb over ~1km as gain 50 / grade ~5%", () => {
    const track = mkTrack(
      [
        [0, 0, 0],
        [metersLat(1000), 0, 50],
      ],
      0,
    );
    const hill = detectHill(track);
    expect(hill).not.toBeNull();
    expect(hill!.gainM).toBe(50);
    expect(hill!.lengthM).toBeCloseTo(1000, 0);
    expect(hill!.gradePct).toBeCloseTo(5, 0);
    expect(hill!.lat).toBe(0);
    expect(hill!.lon).toBe(0);
  });

  it("does not split the climb on a <=2m dip", () => {
    const track = mkTrack(
      [
        [0, 0, 0],
        [metersLat(150), 0, 15],
        [metersLat(200), 0, 13], // exactly 2m dip from running max 15 - within tolerance
        [metersLat(400), 0, 30],
      ],
      0,
    );
    const hill = detectHill(track);
    expect(hill).not.toBeNull();
    expect(hill!.gainM).toBe(30); // full climb 0 -> 30, dip did not close the segment
  });

  it("splits the climb on a >2m drop", () => {
    const track = mkTrack(
      [
        [0, 0, 0],
        [metersLat(400), 0, 30], // segment 1: gain 30, closes on the drop below
        [metersLat(450), 0, 15], // 15m drop (>2m tolerance) - closes segment 1
        [metersLat(950), 0, 50], // segment 2: gain 50-15=35
      ],
      0,
    );
    const hill = detectHill(track);
    expect(hill).not.toBeNull();
    // If the drop hadn't split the segments, gain would read 50 (0 -> 50).
    // Splitting correctly yields the max-gain segment: 35 (15 -> 50).
    expect(hill!.gainM).toBe(35);
  });

  it("returns null for a flat track", () => {
    const track = mkTrack(
      [
        [0, 0, 10],
        [metersLat(500), 0, 10],
        [metersLat(1000), 0, 10],
      ],
      0,
    );
    expect(detectHill(track)).toBeNull();
  });

  it("returns null for fewer than 2 points", () => {
    expect(detectHill(mkTrack([[0, 0, 0]], 0))).toBeNull();
    expect(detectHill([])).toBeNull();
  });

  it("returns null when gain is present but grade is too shallow", () => {
    // gain 30 over 5km => 0.6% grade, well under the 3% threshold
    const track = mkTrack(
      [
        [0, 0, 0],
        [metersLat(5000), 0, 30],
      ],
      0,
    );
    expect(detectHill(track)).toBeNull();
  });
});

describe("detectHillBeast", () => {
  function steepClimb(): [number, number, number][] {
    return [
      [0, 0, 0],
      [metersLat(400), 0, 30],
    ];
  }

  it("emits nothing when no cell has hills from >= 3 distinct runs", () => {
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mkTrack(steepClimb(), 0) }),
      mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: mkTrack(steepClimb(), 0) }),
    ];
    expect(detectHillBeast(mkYear(runs))).toEqual([]);
  });

  it("emits hill-beast for a recurring hill location across >= 3 runs", () => {
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mkTrack(steepClimb(), 0) }),
      mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: mkTrack(steepClimb(), 0) }),
      mkRun({ id: "r3", startLocal: "2025-01-03T08:00:00", track: mkTrack(steepClimb(), 0) }),
    ];
    const events = detectHillBeast(mkYear(runs));
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("hill-beast");
    expect(event.runIds).toEqual(["r1", "r2", "r3"]);
    expect(event.atUtc).toBe(runs[0]!.startUtc);
    expect(event.magnitude).toBe(30);
    expect(event.data["gainM"]).toBe(30);
    expect(event.data["times"]).toBe(3);
    expect(typeof event.data["gradePct"]).toBe("number");
  });

  it("returns [] for an empty year", () => {
    expect(detectHillBeast(EMPTY_YEAR)).toEqual([]);
  });
});

describe("detectGhosts", () => {
  it("flags a run at >= 200m and >= 4x median, only at a place with >= 5 runs", () => {
    const runs = [
      mkRun({ id: "g1", startLocal: "2025-01-01T08:00:00", placeId: "P1", elevationGain: 10 }),
      mkRun({ id: "g2", startLocal: "2025-01-02T08:00:00", placeId: "P1", elevationGain: 10 }),
      mkRun({ id: "g3", startLocal: "2025-01-03T08:00:00", placeId: "P1", elevationGain: 10 }),
      mkRun({ id: "g4", startLocal: "2025-01-04T08:00:00", placeId: "P1", elevationGain: 10 }),
      mkRun({ id: "g5", startLocal: "2025-01-05T08:00:00", placeId: "P1", elevationGain: 300 }),
    ];
    const events = detectGhosts(mkYear(runs));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "ghost-elevation",
      runIds: ["g5"],
      magnitude: 300,
      data: { elevationGainM: 300, medianM: 10, startLocal: "2025-01-05T08:00:00" },
    });
  });

  it("does not flag when the run fails the >=200m absolute threshold", () => {
    const runs = [
      mkRun({ id: "a1", startLocal: "2025-01-01T08:00:00", placeId: "P2", elevationGain: 10 }),
      mkRun({ id: "a2", startLocal: "2025-01-02T08:00:00", placeId: "P2", elevationGain: 10 }),
      mkRun({ id: "a3", startLocal: "2025-01-03T08:00:00", placeId: "P2", elevationGain: 10 }),
      mkRun({ id: "a4", startLocal: "2025-01-04T08:00:00", placeId: "P2", elevationGain: 10 }),
      mkRun({ id: "a5", startLocal: "2025-01-05T08:00:00", placeId: "P2", elevationGain: 35 }),
    ];
    expect(detectGhosts(mkYear(runs))).toEqual([]);
  });

  it("does not flag when fewer than 5 runs are recorded at the place", () => {
    const runs = [
      mkRun({ id: "b1", startLocal: "2025-01-01T08:00:00", placeId: "P3", elevationGain: 10 }),
      mkRun({ id: "b2", startLocal: "2025-01-02T08:00:00", placeId: "P3", elevationGain: 10 }),
      mkRun({ id: "b3", startLocal: "2025-01-03T08:00:00", placeId: "P3", elevationGain: 10 }),
      mkRun({ id: "b4", startLocal: "2025-01-04T08:00:00", placeId: "P3", elevationGain: 300 }),
    ];
    expect(detectGhosts(mkYear(runs))).toEqual([]);
  });

  it("uses the 200m-alone threshold when the median is 0", () => {
    const runs = [
      mkRun({ id: "c1", startLocal: "2025-01-01T08:00:00", placeId: "P4", elevationGain: 0 }),
      mkRun({ id: "c2", startLocal: "2025-01-02T08:00:00", placeId: "P4", elevationGain: 0 }),
      mkRun({ id: "c3", startLocal: "2025-01-03T08:00:00", placeId: "P4", elevationGain: 0 }),
      mkRun({ id: "c4", startLocal: "2025-01-04T08:00:00", placeId: "P4", elevationGain: 0 }),
      mkRun({ id: "c5", startLocal: "2025-01-05T08:00:00", placeId: "P4", elevationGain: 250 }),
    ];
    const events = detectGhosts(mkYear(runs));
    expect(events).toHaveLength(1);
    expect(events[0]!.runIds).toEqual(["c5"]);
    expect(events[0]!.data["medianM"]).toBe(0);
  });

  it("returns [] for an empty year", () => {
    expect(detectGhosts(EMPTY_YEAR)).toEqual([]);
  });

  it("ignores runs with a null placeId", () => {
    const runs = [
      mkRun({ id: "n1", startLocal: "2025-01-01T08:00:00", placeId: null, elevationGain: 500 }),
    ];
    expect(detectGhosts(mkYear(runs))).toEqual([]);
  });
});

describe("detectJourneys", () => {
  it("detects a journey between Mumbai and West Lafayette tracks", () => {
    const mumbaiTrack = mkTrack(
      [
        [19.08, 72.88, 10],
        [19.081, 72.881, 10],
      ],
      0,
    );
    const westLafayetteTrack = mkTrack(
      [
        [40.42, -86.92, 200],
        [40.421, -86.921, 200],
      ],
      0,
    );
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: mumbaiTrack }),
      mkRun({ id: "r2", startLocal: "2025-06-01T08:00:00", track: westLafayetteTrack }),
    ];
    const events = detectJourneys(mkYear(runs));
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("journey");
    expect(event.runIds).toEqual(["r1", "r2"]);
    expect(event.atUtc).toBe(runs[1]!.startUtc);
    expect(event.data["fromCity"]).toBe("Mumbai");
    expect(event.magnitude).toBeGreaterThan(12800);
    expect(event.magnitude).toBeLessThan(13400);
  });

  it("does not emit a journey for two runs only 3km apart", () => {
    const t1 = mkTrack([[10, 10, 0]], 0);
    const t2 = mkTrack([[10 + metersLat(3000), 10, 0]], 0);
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00", track: t1 }),
      mkRun({ id: "r2", startLocal: "2025-01-02T08:00:00", track: t2 }),
    ];
    expect(detectJourneys(mkYear(runs))).toEqual([]);
  });

  it("returns [] for an empty year", () => {
    expect(detectJourneys(EMPTY_YEAR)).toEqual([]);
  });

  it("ignores runs without a track", () => {
    const runs = [
      mkRun({ id: "r1", startLocal: "2025-01-01T08:00:00" }),
      mkRun({ id: "r2", startLocal: "2025-06-01T08:00:00" }),
    ];
    expect(detectJourneys(mkYear(runs))).toEqual([]);
  });
});

describe("analyzeYear", () => {
  it("returns { events: [] } for an empty year and never throws", () => {
    expect(analyzeYear(EMPTY_YEAR)).toEqual({ events: [] });
  });

  it("sorts events by atUtc ascending, then type lexicographically on ties", () => {
    const run = mkRun({
      id: "solo",
      startLocal: "2025-04-01T08:00:00",
      km: 5,
      minutes: 25,
      elevationGain: 50,
    });
    const { events } = analyzeYear(mkYear([run]));
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      const a = events[i - 1]!;
      const b = events[i]!;
      expect(a.atUtc <= b.atUtc).toBe(true);
      if (a.atUtc === b.atUtc) {
        expect(a.type <= b.type).toBe(true);
      }
    }
    // A single run ties first-run/last-run/etc. on atUtc: verify the tie-break
    // actually engaged (both types present at the same atUtc, ordered lexically).
    const firstIdx = events.findIndex((e) => e.type === "first-run");
    const lastIdx = events.findIndex((e) => e.type === "last-run");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(lastIdx).toBeGreaterThanOrEqual(0);
    expect(events[firstIdx]!.atUtc).toBe(events[lastIdx]!.atUtc);
    expect(firstIdx).toBeLessThan(lastIdx); // "first-run" < "last-run" lexicographically
  });

  it("does not mutate the input year", () => {
    const runs = [
      mkRun({ id: "a", startLocal: "2025-03-02T08:00:00" }),
      mkRun({ id: "b", startLocal: "2025-03-01T08:00:00" }),
    ];
    const year = mkYear(runs);
    const before = [...year.runs];
    analyzeYear(year);
    expect(year.runs).toEqual(before);
  });
});
