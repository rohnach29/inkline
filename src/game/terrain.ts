import type { Run } from "../ingest";
import { haversineM, downsample } from "../ingest";

/** xM = cumulative meters along the year. */
export interface TerrainPoint {
  xM: number;
  elevM: number;
}

/** Flat two-point segment used when there is nothing to stitch (demo-proof). */
const EMPTY_TERRAIN: TerrainPoint[] = [
  { xM: 0, elevM: 0 },
  { xM: 2000, elevM: 0 },
];

const REST_DAY_BRIDGE_M = 200;

/**
 * Stitch tracked runs chronologically into one profile.
 *
 * Per run: walk track points, xM advances by horizontal haversine distance
 * between consecutive points, elevM = point ele. Runs are downsampled first
 * (tolerance 8). Between runs a flat 200m bridge is inserted at the previous
 * run's final elevation (the rest day). Elevation is re-based per run: the
 * run's own first ele maps onto the previous segment's end elevation (no
 * cliffs between Mumbai sea level and Indiana). Runs without a track or with
 * fewer than 2 points are skipped entirely (no bridge is spent on them).
 * Empty input, or input where every run is skipped, yields the flat default
 * segment. Output x is strictly increasing.
 */
export function stitchTerrain(runs: readonly Run[]): TerrainPoint[] {
  const sorted = [...runs].sort((a, b) => a.startUtc - b.startUtc);

  const points: TerrainPoint[] = [];
  let xM = 0;
  let prevEndEle: number | null = null;

  for (const run of sorted) {
    if (!run.track || run.track.length < 2) continue;

    const ds = downsample(run.track, 8);
    if (ds.length < 2) continue;

    const isFirstIncluded: boolean = prevEndEle === null;

    if (!isFirstIncluded) {
      // Rest-day bridge: flat 200m at the previous segment's final elevation.
      xM += REST_DAY_BRIDGE_M;
      points.push({ xM, elevM: prevEndEle! });
    } else {
      points.push({ xM, elevM: ds[0]!.ele });
    }

    // Re-base: this run's own first ele maps onto the elevation the profile
    // is already at (prevEndEle for stitched runs, its own first ele for the
    // very first included run).
    const offset: number = isFirstIncluded ? 0 : prevEndEle! - ds[0]!.ele;

    for (let i = 1; i < ds.length; i++) {
      const prev = ds[i - 1]!;
      const cur = ds[i]!;
      xM += haversineM(prev, cur);
      points.push({ xM, elevM: cur.ele + offset });
    }

    prevEndEle = ds[ds.length - 1]!.ele + offset;
  }

  if (points.length === 0) {
    return EMPTY_TERRAIN.map((p) => ({ ...p }));
  }

  return points;
}

/** Linear interpolation of elevM at xM; clamps to ends. */
export function elevAt(terrain: readonly TerrainPoint[], xM: number): number {
  if (terrain.length === 0) return 0;
  const first = terrain[0]!;
  if (terrain.length === 1) return first.elevM;

  if (xM <= first.xM) return first.elevM;
  const last = terrain[terrain.length - 1]!;
  if (xM >= last.xM) return last.elevM;

  for (let i = 1; i < terrain.length; i++) {
    const a = terrain[i - 1]!;
    const b = terrain[i]!;
    if (xM <= b.xM) {
      if (b.xM === a.xM) return b.elevM;
      const t = (xM - a.xM) / (b.xM - a.xM);
      return a.elevM + t * (b.elevM - a.elevM);
    }
  }
  return last.elevM;
}

/** Total length in meters. */
export function terrainLengthM(terrain: readonly TerrainPoint[]): number {
  if (terrain.length < 2) return 0;
  return terrain[terrain.length - 1]!.xM - terrain[0]!.xM;
}
