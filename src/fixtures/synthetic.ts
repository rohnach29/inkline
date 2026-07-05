import type { Place, Run, TrackPoint, Year } from "../ingest";

/**
 * Hand-authored deterministic fixture for Plan B storytelling tests.
 *
 * NO rng, NO Date.now() — every timestamp is computed from literal
 * (year, month, day, hour, minute, second) fields via Date.UTC, which is
 * pure arithmetic and fully deterministic. Two fake places:
 *   - Mumbai-like coastal city: 19.08 / 72.88, tz Asia/Kolkata (UTC+5:30, no DST)
 *   - Lafayette(-ish) college town: 40.42 / -86.92, tz America/Indiana/Indianapolis
 *     (all runs below fall in the Mar 9 - Nov 2 2025 US DST window, so a
 *     fixed EDT / UTC-4 offset is accurate for every one of them).
 *
 * Engineered to trigger every B2/B3 detector:
 *   - first-run / last-run (year boundary runs)
 *   - 2 false starts (sub-1km runs)
 *   - 2 night runs (22:00-04:00 local)
 *   - a 6-day running streak
 *   - a 40-day quiet gap
 *   - a journey (Mumbai -> Lafayette, >500km)
 *   - a 4-run repeated route / route-champion (identical track reused)
 *   - a hill-beast (a 60m climb embedded in that same repeated route)
 *   - a ghost-elevation (one 300m-gain run among a place otherwise ~15-60m)
 *   - a longest-run (21.1 km)
 *   - fastest-run / hilliest-run / earliest-run / latest-run fall out
 *     automatically from the data above
 *   - month events (one per distinct calendar month with a run)
 */

const PLACE_MUMBAI = "place-mumbai";
const PLACE_LAFAYETTE = "place-lafayette";

const MUMBAI_LAT = 19.08;
const MUMBAI_LON = 72.88;
const LAFAYETTE_LAT = 40.42;
const LAFAYETTE_LON = -86.92;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** "YYYY-MM-DDTHH:MM:SS" — plain string formatting, no Date object involved. */
function localStr(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;
}

/** UTC epoch ms for a local wall-clock time at a fixed (signed) UTC offset in hours.
 *  Date.UTC on literal numeric fields is pure arithmetic — deterministic, not a clock read. */
function utcMs(y: number, mo: number, d: number, h: number, mi: number, s: number, offsetHours: number): number {
  return Date.UTC(y, mo - 1, d, h, mi, s) - offsetHours * 3_600_000;
}

/** A flat (no elevation change) synthetic loop of 20 points, ~100m apart. */
function flatTrack(baseLat: number, baseLon: number, baseEle: number, startT: number): TrackPoint[] {
  const stepDeg = 100 / 111_320; // ~100m per step, longitude direction
  const points: TrackPoint[] = [];
  for (let i = 0; i < 20; i++) {
    points.push({ lat: baseLat, lon: baseLon + i * stepDeg, ele: baseEle, t: startT + i * 20_000 });
  }
  return points;
}

/**
 * A 24-point synthetic loop with a 60m climb built into the first ~1200m:
 * elevation ramps up 7.5m/step for 8 steps (0 -> 60m gain, ~5% grade),
 * holds for 4 steps, then descends back down over the remaining 11 steps.
 * detectHill's non-decreasing-with-2m-dip-tolerance walk finds exactly one
 * qualifying climb segment here (gain=60 >= 25, grade=5% >= 3%).
 */
function hillLoopTrack(baseLat: number, baseLon: number, baseEle: number, startT: number): TrackPoint[] {
  const stepDeg = 100 / 111_320;
  const points: TrackPoint[] = [];
  for (let i = 0; i < 24; i++) {
    let ele: number;
    if (i <= 8) ele = baseEle + i * 7.5;
    else if (i <= 12) ele = baseEle + 60;
    else ele = baseEle + 60 - (i - 12) * 5;
    points.push({ lat: baseLat, lon: baseLon + i * stepDeg, ele, t: startT + i * 30_000 });
  }
  return points;
}

interface RunSpec {
  id: string;
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  offsetHours: number;
  tz: string;
  km: number;
  minutes: number;
  elevationGain: number;
  placeId: string;
  track?: TrackPoint[];
}

function makeRun(spec: RunSpec): Run {
  return {
    id: spec.id,
    startUtc: utcMs(spec.y, spec.mo, spec.d, spec.h, spec.mi, spec.s, spec.offsetHours),
    startLocal: localStr(spec.y, spec.mo, spec.d, spec.h, spec.mi, spec.s),
    tz: spec.tz,
    timezoneUncertain: false,
    km: spec.km,
    minutes: spec.minutes,
    elevationGain: spec.elevationGain,
    indoor: false,
    track: spec.track,
    placeId: spec.placeId,
  };
}

const IST = 5.5;
const EDT = -4;
const TZ_MUMBAI = "Asia/Kolkata";
const TZ_LAFAYETTE = "America/Indiana/Indianapolis";

export function makeSyntheticYear(): Year {
  // The 4 repeated-route runs share the exact same track array reference —
  // that's what gives them 100% route-cell overlap (route-champion) and an
  // identical hill-cell (hill-beast), the simplest way to guarantee both
  // detectors fire on the same physical loop. Track point timestamps are
  // relative to the first run of the loop only; the detectors that consume
  // this data (route clustering, hill walk) never read TrackPoint.t.
  const hillTrack = hillLoopTrack(LAFAYETTE_LAT, LAFAYETTE_LON, 200, utcMs(2025, 4, 10, 7, 30, 0, EDT));

  const runs: Run[] = [
    // --- Place A (Mumbai): year opens, false starts, night runs ---
    makeRun({ id: "r01-first", y: 2025, mo: 1, d: 3, h: 6, mi: 15, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 3.0, minutes: 18, elevationGain: 5, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r02-falsestart-a", y: 2025, mo: 1, d: 4, h: 6, mi: 20, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 0.4, minutes: 3, elevationGain: 0, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r03-falsestart-b", y: 2025, mo: 1, d: 5, h: 6, mi: 10, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 0.6, minutes: 4, elevationGain: 0, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r04-night-a", y: 2025, mo: 1, d: 20, h: 23, mi: 15, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 5.0, minutes: 30, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r05-night-b", y: 2025, mo: 1, d: 21, h: 0, mi: 45, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 5.2, minutes: 31, elevationGain: 8, placeId: PLACE_MUMBAI }),

    // --- 6-day streak (Feb 1-6) ---
    makeRun({ id: "r06-streak-1", y: 2025, mo: 2, d: 1, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 4.0, minutes: 24, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r07-streak-2", y: 2025, mo: 2, d: 2, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 4.2, minutes: 25, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r08-streak-3", y: 2025, mo: 2, d: 3, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 3.8, minutes: 23, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r09-streak-4", y: 2025, mo: 2, d: 4, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 4.5, minutes: 27, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r10-streak-5", y: 2025, mo: 2, d: 5, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 4.1, minutes: 25, elevationGain: 10, placeId: PLACE_MUMBAI }),
    makeRun({ id: "r11-streak-6", y: 2025, mo: 2, d: 6, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI, km: 4.3, minutes: 26, elevationGain: 10, placeId: PLACE_MUMBAI }),

    // --- 40-day quiet gap (Feb 6 -> Mar 18), then the journey anchor ---
    makeRun({
      id: "r12-quiet-end-fastest",
      y: 2025, mo: 3, d: 18, h: 7, mi: 0, s: 0, offsetHours: IST, tz: TZ_MUMBAI,
      km: 5.0, minutes: 22, elevationGain: 10, placeId: PLACE_MUMBAI,
      track: flatTrack(MUMBAI_LAT, MUMBAI_LON, 10, utcMs(2025, 3, 18, 7, 0, 0, IST)),
    }),

    // --- Place B (Lafayette): journey lands here ---
    makeRun({
      id: "r13-journey-land",
      y: 2025, mo: 4, d: 1, h: 8, mi: 0, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE,
      km: 6.0, minutes: 36, elevationGain: 15, placeId: PLACE_LAFAYETTE,
      track: flatTrack(40.415, -86.925, 200, utcMs(2025, 4, 1, 8, 0, 0, EDT)),
    }),

    // --- Repeated route + hill-beast (same track, 4 times) ---
    makeRun({ id: "r14-hillroute-1", y: 2025, mo: 4, d: 10, h: 7, mi: 30, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE, km: 3.2, minutes: 20, elevationGain: 60, placeId: PLACE_LAFAYETTE, track: hillTrack }),
    makeRun({ id: "r15-hillroute-2", y: 2025, mo: 4, d: 24, h: 7, mi: 30, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE, km: 3.2, minutes: 20, elevationGain: 60, placeId: PLACE_LAFAYETTE, track: hillTrack }),
    makeRun({ id: "r16-hillroute-3", y: 2025, mo: 5, d: 8, h: 7, mi: 30, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE, km: 3.2, minutes: 20, elevationGain: 60, placeId: PLACE_LAFAYETTE, track: hillTrack }),
    makeRun({ id: "r17-hillroute-4", y: 2025, mo: 5, d: 22, h: 7, mi: 30, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE, km: 3.2, minutes: 20, elevationGain: 60, placeId: PLACE_LAFAYETTE, track: hillTrack }),

    // --- Ghost elevation (300m gain outlier vs the ~15-60m median at this place) ---
    makeRun({
      id: "r18-ghost-hilliest",
      y: 2025, mo: 6, d: 5, h: 7, mi: 30, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE,
      km: 4.0, minutes: 24, elevationGain: 300, placeId: PLACE_LAFAYETTE,
      track: flatTrack(40.43, -86.9, 200, utcMs(2025, 6, 5, 7, 30, 0, EDT)),
    }),

    // --- Longest run of the year (also becomes last-run: latest startUtc).
    // Kept within 21 days of the ghost run above so this doesn't open a
    // second "quiet" gap — the fixture wants exactly one (the 40-day one). ---
    makeRun({ id: "r19-longest-last", y: 2025, mo: 6, d: 20, h: 7, mi: 0, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE, km: 21.1, minutes: 126, elevationGain: 20, placeId: PLACE_LAFAYETTE }),
  ];

  const mumbaiCount = runs.filter((r) => r.placeId === PLACE_MUMBAI).length;
  const lafayetteCount = runs.filter((r) => r.placeId === PLACE_LAFAYETTE).length;

  const places: Place[] = [
    { id: PLACE_MUMBAI, lat: MUMBAI_LAT, lon: MUMBAI_LON, runCount: mumbaiCount },
    { id: PLACE_LAFAYETTE, lat: LAFAYETTE_LAT, lon: LAFAYETTE_LON, runCount: lafayetteCount },
  ];

  const firstUtc = Math.min(...runs.map((r) => r.startUtc));
  const lastUtc = Math.max(...runs.map((r) => r.startUtc));

  return { runs, places, span: { firstUtc, lastUtc } };
}
