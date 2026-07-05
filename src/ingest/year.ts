import type { Place, Run, TrackPoint, Year } from "./types";
import type { RawExport } from "./zip";
import { parseGpx } from "./gpx";
import { trackStats, haversineM } from "./stats";
import { downsample } from "./downsample";
import { runClock } from "./clock";
import { WorkoutScanner, type WorkoutRecord } from "./workouts";

// tracks with fewer points are GPS noise; their workouts still surface as GPS-less runs
const MIN_TRACK_POINTS = 10;
const SCAN_CHUNK = 1_000_000;
const PLACE_RADIUS_M = 50_000;

interface ParsedTrack {
  name: string;
  points: TrackPoint[];
}

function scanWorkouts(xml: string): WorkoutRecord[] {
  const scanner = new WorkoutScanner();
  for (let i = 0; i < xml.length; i += SCAN_CHUNK) {
    scanner.push(xml.slice(i, i + SCAN_CHUNK));
  }
  return scanner.workouts.filter((w) => w.activity.includes("Running"));
}

function majorityTz(runs: Run[]): string {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.tz, (counts.get(r.tz) ?? 0) + 1);
  let best = "UTC";
  let bestCount = 0;
  for (const r of runs) {
    // iterate in run order so ties resolve to the earliest run's tz
    const c = counts.get(r.tz)!;
    if (c > bestCount) {
      best = r.tz;
      bestCount = c;
    }
  }
  return best;
}

/** Clusters run start points within 50 km. Mutates each run's placeId in place. Anchors on the cluster's first run, not a centroid. */
export function assignPlaces(runs: Run[]): Place[] {
  const places: Place[] = [];
  for (const run of runs) {
    const p = run.track?.[0];
    if (!p) continue;
    let found = places.find((pl) => haversineM(pl, p) < PLACE_RADIUS_M);
    if (!found) {
      found = { id: `place-${places.length}`, lat: p.lat, lon: p.lon, runCount: 0 };
      places.push(found);
    }
    found.runCount++;
    run.placeId = found.id;
  }
  return places;
}

export function buildYear(raw: RawExport): Year {
  const tracks: ParsedTrack[] = [];
  for (const [name, xml] of raw.gpxFiles) {
    const points = parseGpx(xml);
    if (points.length >= MIN_TRACK_POINTS) tracks.push({ name, points });
  }
  tracks.sort((a, b) => a.points[0]!.t - b.points[0]!.t);

  const workouts = raw.exportXml ? scanWorkouts(raw.exportXml) : [];
  const used = new Set<number>();
  const runs: Run[] = [];

  for (const tr of tracks) {
    const t0 = tr.points[0]!.t;
    const t1 = tr.points[tr.points.length - 1]!.t;
    let match: WorkoutRecord | undefined;
    let matchIdx = -1;
    let bestOverlap = 0.5 * (t1 - t0); // threshold: must beat half the track duration
    for (let i = 0; i < workouts.length; i++) {
      if (used.has(i)) continue;
      const w = workouts[i]!;
      const overlap = Math.min(t1, w.endUtc) - Math.max(t0, w.startUtc);
      if (overlap > bestOverlap) {
        match = w;
        matchIdx = i;
        bestOverlap = overlap;
      }
    }
    if (matchIdx !== -1) used.add(matchIdx);
    const stats = trackStats(tr.points); // raw track: real elevation
    const clock = runClock(t0, tr.points[0]!);
    runs.push({
      id: tr.name.replace(/\.gpx$/, ""),
      startUtc: t0,
      startLocal: clock.startLocal,
      tz: clock.tz,
      timezoneUncertain: false,
      km: match?.km ?? stats.km,
      minutes: match?.durationMin ?? stats.minutes,
      elevationGain: stats.elevationGain,
      indoor: false,
      track: downsample(tr.points),
      placeId: null,
    });
  }

  const fallbackTz = majorityTz(runs);
  for (let i = 0; i < workouts.length; i++) {
    if (used.has(i)) continue;
    const w = workouts[i]!;
    const clock = runClock(w.startUtc, undefined, fallbackTz);
    runs.push({
      id: `workout-${i}-${w.startUtc}`,
      startUtc: w.startUtc,
      startLocal: clock.startLocal,
      tz: clock.tz,
      timezoneUncertain: true,
      km: w.km ?? 0,
      minutes: w.durationMin ?? (w.endUtc - w.startUtc) / 60_000,
      elevationGain: 0,
      indoor: w.indoor,
      placeId: null,
    });
  }

  runs.sort((a, b) => a.startUtc - b.startUtc);
  const places = assignPlaces(runs);
  return {
    runs,
    places,
    span:
      runs.length > 0
        ? { firstUtc: runs[0]!.startUtc, lastUtc: runs[runs.length - 1]!.startUtc }
        : { firstUtc: 0, lastUtc: 0 },
  };
}
