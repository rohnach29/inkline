import { describe, it, expect } from "vitest";
import { projectTrack, pathFrom, routeSvg, flightSvg, esc } from "./svg";
import type { XY } from "./svg";
import type { TrackPoint } from "../ingest";
import type { LatLonName } from "../storytell";

describe("projectTrack", () => {
  const track: TrackPoint[] = [
    { lat: 19.07, lon: 72.87, ele: 0, t: 0 },
    { lat: 19.10, lon: 72.90, ele: 0, t: 1000 },
    { lat: 19.05, lon: 72.95, ele: 0, t: 2000 },
  ];

  it("stays within pad bounds for default width/height/pad", () => {
    const pts = projectTrack(track);
    expect(pts.length).toBe(3);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(24);
      expect(p.x).toBeLessThanOrEqual(376);
      expect(p.y).toBeGreaterThanOrEqual(24);
      expect(p.y).toBeLessThanOrEqual(276);
    }
  });

  it("preserves aspect ratio within 10% of ground truth", () => {
    const pts = projectTrack(track);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const dx = Math.max(...xs) - Math.min(...xs);
    const dy = Math.max(...ys) - Math.min(...ys);

    const lats = track.map((p) => p.lat);
    const lons = track.map((p) => p.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const gLons = lons.map((l) => l * cosLat);
    const groundDx = Math.max(...gLons) - Math.min(...gLons);
    const groundDy = Math.max(...lats) - Math.min(...lats);

    const gotRatio = dx / dy;
    const groundRatio = groundDx / groundDy;
    expect(Math.abs(gotRatio - groundRatio) / groundRatio).toBeLessThan(0.1);
  });

  it("north = smaller y (higher lat maps to smaller pixel y)", () => {
    const pts = projectTrack(track);
    // track[1] has the highest lat (19.10), track[2] the lowest (19.05)
    expect(pts[1]!.y).toBeLessThan(pts[2]!.y);
  });

  it("returns [] for a single point", () => {
    expect(projectTrack([track[0]!])).toEqual([]);
  });

  it("returns [] for an empty track", () => {
    expect(projectTrack([])).toEqual([]);
  });
});

describe("pathFrom", () => {
  const points: XY[] = [
    { x: 10, y: 10 },
    { x: 50, y: 40 },
    { x: 90, y: 20 },
    { x: 130, y: 60 },
  ];

  it("is deterministic for the same seed", () => {
    expect(pathFrom(points, "seed-a")).toBe(pathFrom(points, "seed-a"));
  });

  it("differs for different seeds", () => {
    expect(pathFrom(points, "seed-a")).not.toBe(pathFrom(points, "seed-b"));
  });

  it("starts with M, contains Q, and coords have 1 decimal", () => {
    const d = pathFrom(points, "seed-a");
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("Q");
    const nums = d.match(/-?\d+\.\d/g) ?? [];
    expect(nums.length).toBeGreaterThan(0);
  });

  it("respects amp: first M point stays within amp of the original point", () => {
    const amp = 1.6;
    const many: XY[] = Array.from({ length: 50 }, (_, i) => ({
      x: i * 3,
      y: (i % 5) * 7,
    }));
    const d = pathFrom(many, "amp-seed", amp);
    const match = d.match(/^M (-?\d+\.\d),(-?\d+\.\d)/);
    expect(match).not.toBeNull();
    const jx = Number(match![1]);
    const jy = Number(match![2]);
    expect(Math.abs(jx - many[0]!.x)).toBeLessThanOrEqual(amp + 0.05);
    expect(Math.abs(jy - many[0]!.y)).toBeLessThanOrEqual(amp + 0.05);
  });
});

describe("routeSvg", () => {
  const track: TrackPoint[] = Array.from({ length: 20 }, (_, i) => ({
    lat: 19.07 + i * 0.001,
    lon: 72.87 + i * 0.001,
    ele: 0,
    t: i * 1000,
  }));

  it("contains viewBox, ink-route class, wobble filter, and ink-start circle", () => {
    const svg = routeSvg(track, "run-1");
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain("ink-route");
    expect(svg).toContain('filter="url(#wobble)"');
    expect(svg).toContain("ink-start");
  });

  it("returns empty string for a single-point track", () => {
    expect(routeSvg([track[0]!], "run-1")).toBe("");
  });

  it("returns empty string for an empty track", () => {
    expect(routeSvg([], "run-1")).toBe("");
  });

  it("is deterministic for the same runId", () => {
    expect(routeSvg(track, "run-1")).toBe(routeSvg(track, "run-1"));
  });

  it("downsamples large tracks to <= 220 route points", () => {
    const big: TrackPoint[] = Array.from({ length: 500 }, (_, i) => ({
      lat: 19.0 + Math.sin(i / 10) * 0.01 + i * 0.0001,
      lon: 72.8 + Math.cos(i / 10) * 0.01 + i * 0.0001,
      ele: 0,
      t: i * 1000,
    }));
    const svg = routeSvg(big, "run-big");
    const qCount = (svg.match(/ Q /g) ?? []).length;
    expect(qCount).toBeLessThanOrEqual(221);
  });
});

describe("flightSvg", () => {
  const from: LatLonName = { lat: 19.07, lon: 72.87, name: "Mumbai & Home" };
  const to: LatLonName = { lat: 40.71, lon: -74.0, name: "New York" };

  it("contains esc'd names, dashed arc class, and comma-grouped distance", () => {
    const svg = flightSvg(from, to, 12841.7);
    expect(svg).toContain("Mumbai &amp; Home");
    expect(svg).not.toContain("Mumbai & Home");
    expect(svg).toContain("ink-arc");
    expect(svg).toContain("≈ 12,842 km");
  });

  it("contains viewBox and globe class", () => {
    const svg = flightSvg(from, to, 12841.7);
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg).toContain("ink-globe");
    expect(svg).toContain("ink-graticule");
  });

  it("is deterministic", () => {
    const a = flightSvg(from, to, 12841.7);
    const b = flightSvg(from, to, 12841.7);
    expect(a).toBe(b);
  });
});

describe("esc", () => {
  it("escapes all 5 special characters", () => {
    expect(esc("&")).toBe("&amp;");
    expect(esc("<")).toBe("&lt;");
    expect(esc(">")).toBe("&gt;");
    expect(esc('"')).toBe("&quot;");
    expect(esc("'")).toBe("&#39;");
  });

  it("escapes a mixed string correctly", () => {
    expect(esc(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});
