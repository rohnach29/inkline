import { haversineM } from "../ingest";
import type { Run, TrackPoint, Year } from "../ingest";
import type { StoryEvent } from "./types";
import { nearestCity } from "./cities";

const ROUTE_CELL_SCALE = 500; // ~220m cells
const HILL_CELL_SCALE = 200; // ~550m cells
const HILL_DIP_TOLERANCE_M = 2;
const HILL_MIN_GAIN_M = 25;
const HILL_MIN_GRADE_PCT = 3;
const JOURNEY_MIN_M = 500_000;
const ROUTE_CLUSTER_OVERLAP = 0.5;
const ROUTE_CHAMPION_MIN_RUNS = 3;
const HILL_BEAST_MIN_RUNS = 3;
const GHOST_MIN_RUNS_AT_PLACE = 5;
const GHOST_MIN_GAIN_M = 200;
const GHOST_MEDIAN_MULTIPLE = 4;

function sortByStartUtc(runs: readonly Run[]): Run[] {
  return [...runs].sort((a, b) => a.startUtc - b.startUtc);
}

function runsWithTracks(year: Year): Run[] {
  return sortByStartUtc(year.runs).filter((r) => r.track && r.track.length > 0);
}

function cellKey(lat: number, lon: number, scale: number): string {
  return `${Math.round(lat * scale)}|${Math.round(lon * scale)}`;
}

// --- Route clustering -------------------------------------------------

export interface RouteCluster {
  seedRunId: string;
  runIds: string[];
}

function routeCells(track: readonly TrackPoint[]): Set<string> {
  const cells = new Set<string>();
  for (const p of track) cells.add(cellKey(p.lat, p.lon, ROUTE_CELL_SCALE));
  return cells;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  const minSize = Math.min(a.size, b.size);
  if (minSize === 0) return 0;
  let shared = 0;
  for (const key of a) {
    if (b.has(key)) shared++;
  }
  return shared / minSize;
}

interface WorkingCluster {
  seedRunId: string;
  seedCells: Set<string>;
  runIds: string[];
}

export function clusterRoutes(year: Year): RouteCluster[] {
  const clusters: WorkingCluster[] = [];
  for (const run of runsWithTracks(year)) {
    const cells = routeCells(run.track!);
    let joined = false;
    for (const cluster of clusters) {
      if (overlapRatio(cells, cluster.seedCells) >= ROUTE_CLUSTER_OVERLAP) {
        cluster.runIds.push(run.id);
        joined = true;
        break;
      }
    }
    if (!joined) {
      clusters.push({ seedRunId: run.id, seedCells: cells, runIds: [run.id] });
    }
  }
  return clusters.map((c) => ({ seedRunId: c.seedRunId, runIds: c.runIds }));
}

export function detectRouteChampion(year: Year): StoryEvent[] {
  const clusters = clusterRoutes(year);
  const eligible = clusters.filter((c) => c.runIds.length >= ROUTE_CHAMPION_MIN_RUNS);
  if (eligible.length === 0) return [];

  const runById = new Map(year.runs.map((r) => [r.id, r] as const));
  let best = eligible[0]!;
  let bestSeed = runById.get(best.seedRunId)!;
  for (const candidate of eligible.slice(1)) {
    const candidateSeed = runById.get(candidate.seedRunId)!;
    if (
      candidate.runIds.length > best.runIds.length ||
      (candidate.runIds.length === best.runIds.length && candidateSeed.startUtc < bestSeed.startUtc)
    ) {
      best = candidate;
      bestSeed = candidateSeed;
    }
  }

  return [
    {
      type: "route-champion",
      runIds: best.runIds,
      atUtc: bestSeed.startUtc,
      magnitude: best.runIds.length,
      data: { count: best.runIds.length, seedRunId: best.seedRunId, km: bestSeed.km },
    },
  ];
}

// --- Hills --------------------------------------------------------------

export interface Hill {
  gainM: number;
  lengthM: number;
  gradePct: number;
  lat: number;
  lon: number;
}

/**
 * Walks the track once, building non-overlapping climb segments. A segment
 * extends while elevation is non-decreasing, tolerating dips of up to 2m
 * below the segment's running max; a drop beyond that tolerance closes the
 * segment (the dropping point starts the next one). The max-gain segment
 * that clears the gain/grade thresholds is returned.
 */
export function detectHill(track: readonly TrackPoint[]): Hill | null {
  if (track.length < 2) return null;

  let best: Hill | null = null;
  let start = 0;

  while (start < track.length - 1) {
    let runningMaxEle = track[start]!.ele;
    let lastIncludedIdx = start;
    let idx = start + 1;
    while (idx < track.length) {
      const ele = track[idx]!.ele;
      if (ele > runningMaxEle) runningMaxEle = ele;
      if (runningMaxEle - ele > HILL_DIP_TOLERANCE_M) break;
      lastIncludedIdx = idx;
      idx++;
    }

    const segment = track.slice(start, lastIncludedIdx + 1);
    if (segment.length >= 2) {
      const startEle = segment[0]!.ele;
      const gain = runningMaxEle - startEle;
      let length = 0;
      for (let k = 1; k < segment.length; k++) {
        length += haversineM(segment[k - 1]!, segment[k]!);
      }
      if (length > 0) {
        const gradePct = (gain / length) * 100;
        // Selection rule: max gain *among segments that individually pass the
        // gain/grade gate*, not "find the max-gain segment, then gate it". A
        // long shallow climb (e.g. 100m over 5km, 2% grade) can out-gain a
        // short steep pitch (e.g. 30m over 600m, 5% grade) without qualifying
        // as a hill; gating the raw max-gain segment first would let that
        // shallow climb mask the smaller segment that actually qualifies.
        if (gain >= HILL_MIN_GAIN_M && gradePct >= HILL_MIN_GRADE_PCT) {
          if (!best || gain > best.gainM) {
            best = { gainM: gain, lengthM: length, gradePct, lat: segment[0]!.lat, lon: segment[0]!.lon };
          }
        }
      }
    }

    start = idx; // idx > start always: either it broke past start+1, or hit track.length
  }

  return best;
}

export function detectHillBeast(year: Year): StoryEvent[] {
  interface Contribution {
    run: Run;
    hill: Hill;
  }
  const cellMap = new Map<string, Contribution[]>();

  for (const run of runsWithTracks(year)) {
    const hill = detectHill(run.track!);
    if (!hill) continue;
    const key = cellKey(hill.lat, hill.lon, HILL_CELL_SCALE);
    const list = cellMap.get(key);
    if (list) list.push({ run, hill });
    else cellMap.set(key, [{ run, hill }]);
  }

  let bestKey: string | null = null;
  let bestList: Contribution[] | null = null;
  let bestMeanGrade = -Infinity;
  let bestMeanGain = -Infinity;

  for (const [key, list] of cellMap) {
    if (list.length < HILL_BEAST_MIN_RUNS) continue;
    const meanGrade = list.reduce((sum, c) => sum + c.hill.gradePct, 0) / list.length;
    const meanGain = list.reduce((sum, c) => sum + c.hill.gainM, 0) / list.length;
    const better =
      meanGrade > bestMeanGrade ||
      (meanGrade === bestMeanGrade && meanGain > bestMeanGain) ||
      (meanGrade === bestMeanGrade && meanGain === bestMeanGain && (bestKey === null || key < bestKey));
    if (better) {
      bestKey = key;
      bestList = list;
      bestMeanGrade = meanGrade;
      bestMeanGain = meanGain;
    }
  }

  if (!bestList) return [];

  const meanLat = bestList.reduce((sum, c) => sum + c.hill.lat, 0) / bestList.length;
  const meanLon = bestList.reduce((sum, c) => sum + c.hill.lon, 0) / bestList.length;
  const gainM = Math.round(bestMeanGain);

  return [
    {
      type: "hill-beast",
      runIds: bestList.map((c) => c.run.id), // already chronological: built while iterating sorted runs
      atUtc: bestList[0]!.run.startUtc,
      magnitude: gainM,
      data: {
        gainM,
        gradePct: Math.round(bestMeanGrade * 10) / 10,
        times: bestList.length,
        lat: meanLat,
        lon: meanLon,
      },
    },
  ];
}

// --- Ghosts ---------------------------------------------------------------

function median(sortedAscending: readonly number[]): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0
    ? (sortedAscending[mid - 1]! + sortedAscending[mid]!) / 2
    : sortedAscending[mid]!;
}

export function detectGhosts(year: Year): StoryEvent[] {
  const sorted = sortByStartUtc(year.runs);
  const byPlace = new Map<string, Run[]>();
  for (const run of sorted) {
    if (run.placeId === null) continue;
    const list = byPlace.get(run.placeId);
    if (list) list.push(run);
    else byPlace.set(run.placeId, [run]);
  }

  const events: StoryEvent[] = [];
  for (const runs of byPlace.values()) {
    if (runs.length < GHOST_MIN_RUNS_AT_PLACE) continue;
    const med = median([...runs.map((r) => r.elevationGain)].sort((a, b) => a - b));
    for (const run of runs) {
      const meetsThreshold =
        run.elevationGain >= GHOST_MIN_GAIN_M &&
        (med > 0 ? run.elevationGain >= GHOST_MEDIAN_MULTIPLE * med : true);
      if (meetsThreshold) {
        events.push({
          type: "ghost-elevation",
          runIds: [run.id],
          atUtc: run.startUtc,
          magnitude: run.elevationGain,
          data: {
            elevationGainM: run.elevationGain,
            medianM: Math.round(med * 10) / 10,
            startLocal: run.startLocal,
          },
        });
      }
    }
  }
  return events;
}

// --- Journeys ---------------------------------------------------------------

export function detectJourneys(year: Year): StoryEvent[] {
  const withTracks = runsWithTracks(year);
  const events: StoryEvent[] = [];
  for (let i = 1; i < withTracks.length; i++) {
    const earlier = withTracks[i - 1]!;
    const later = withTracks[i]!;
    const from = earlier.track![0]!;
    const to = later.track![0]!;
    const meters = haversineM(from, to);
    if (meters > JOURNEY_MIN_M) {
      const km = meters / 1000;
      const fromCity = nearestCity(from.lat, from.lon);
      const toCity = nearestCity(to.lat, to.lon);
      events.push({
        type: "journey",
        runIds: [earlier.id, later.id],
        atUtc: later.startUtc,
        magnitude: km,
        data: {
          km,
          fromLat: from.lat,
          fromLon: from.lon,
          toLat: to.lat,
          toLon: to.lon,
          fromCity: fromCity?.name ?? "",
          toCity: toCity?.name ?? "",
        },
      });
    }
  }
  return events;
}
