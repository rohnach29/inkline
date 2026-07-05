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

/**
 * Track geometry: shapes are authored as metre offsets from a base point
 * (deterministic trig only — NO rng), then normalized so the haversine path
 * length exactly matches the length the original straight-line fixture had.
 * That pins the derived km of every tracked run (and therefore every
 * detector outcome) while making demo route maps look like actual runs:
 * a riverside curve, a lopsided block rectangle, a wobbled loop, and an
 * out-and-back with a bulge.
 */

interface OffsetM {
  dLatM: number;
  dLonM: number;
}

/** Scale a metre-offset path so its planar polyline length is targetM.
 *  (Planar length and haversine agree to <0.01% at these ~1.5 km scales.) */
function scaleOffsets(offsets: OffsetM[], targetM: number): OffsetM[] {
  let len = 0;
  for (let i = 1; i < offsets.length; i++) {
    const a = offsets[i - 1]!;
    const b = offsets[i]!;
    len += Math.hypot(b.dLatM - a.dLatM, b.dLonM - a.dLonM);
  }
  const f = targetM / len;
  return offsets.map((o) => ({ dLatM: o.dLatM * f, dLonM: o.dLonM * f }));
}

/** Convert metre offsets to TrackPoints around a base coordinate. */
function offsetsToTrack(
  baseLat: number,
  baseLon: number,
  offsets: OffsetM[],
  eleAt: (i: number) => number,
  startT: number,
  dtMs: number,
): TrackPoint[] {
  const latDeg = 1 / 111_320;
  const lonDeg = 1 / (111_320 * Math.cos((baseLat * Math.PI) / 180));
  return offsets.map((o, i) => ({
    lat: baseLat + o.dLatM * latDeg,
    lon: baseLon + o.dLonM * lonDeg,
    ele: eleAt(i),
    t: startT + i * dtMs,
  }));
}

/** Riverside curve: 26 points drifting north along a shore, the lon
 *  wobbling like a river bank, with a gentle hook at the far end. */
function riversideOffsets(): OffsetM[] {
  const n = 26;
  const out: OffsetM[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push({
      dLatM: i * 70,
      dLonM: 65 * Math.sin(u * Math.PI * 1.6 + 0.3) + 28 * Math.sin(u * Math.PI * 4.0) + u * 60,
    });
  }
  return out;
}

/** Lopsided rectangle around imaginary blocks: 23 points, closed. */
function blockOffsets(): OffsetM[] {
  const corners: OffsetM[] = [
    { dLatM: 0, dLonM: 0 },
    { dLatM: -18, dLonM: 430 },
    { dLatM: 262, dLonM: 458 },
    { dLatM: 288, dLonM: -22 },
  ];
  const perEdge = [7, 4, 7, 4]; // points added per edge (excluding the edge's end corner)
  const out: OffsetM[] = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e]!;
    const b = corners[(e + 1) % 4]!;
    const steps = perEdge[e]!;
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      out.push({ dLatM: a.dLatM + (b.dLatM - a.dLatM) * u, dLonM: a.dLonM + (b.dLonM - a.dLonM) * u });
    }
  }
  out.push({ dLatM: 0, dLonM: 0 }); // close the loop
  return out;
}

/** Slightly squashed, wobbled ellipse: 24 points — the repeated hill loop. */
function loopOffsets(): OffsetM[] {
  const n = 24;
  const out: OffsetM[] = [];
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n;
    const r = 100 * (1 + 0.14 * Math.sin(3 * th + 0.9));
    out.push({ dLatM: 0.82 * r * Math.sin(th), dLonM: r * Math.cos(th) });
  }
  return out;
}

/** Out-and-back with a bulge: 28 points north along a path that bows east,
 *  returning on a parallel line 18 m west. */
function outAndBackOffsets(): OffsetM[] {
  const half = 14;
  const out: OffsetM[] = [];
  for (let i = 0; i < half; i++) {
    const u = i / (half - 1);
    out.push({ dLatM: i * 55, dLonM: 48 * Math.sin(u * Math.PI) });
  }
  for (let i = 0; i < half; i++) {
    const j = half - 1 - i;
    const u = j / (half - 1);
    out.push({ dLatM: j * 55, dLonM: 42 * Math.sin(u * Math.PI) - 18 });
  }
  return out;
}

// Target lengths (m) — the exact haversine lengths of the original
// straight-line fixture tracks, so every run's derived km is unchanged.
const RIVERSIDE_TARGET_M = 1793.6;
const BLOCKS_TARGET_M = 1445.0;
const HILL_LOOP_TARGET_M = 1749.1;
const OUT_AND_BACK_TARGET_M = 1444.7;

/** A flat-elevation shaped track (riverside / blocks / out-and-back). */
function shapedFlatTrack(
  shape: OffsetM[],
  targetM: number,
  baseLat: number,
  baseLon: number,
  baseEle: number,
  startT: number,
): TrackPoint[] {
  return offsetsToTrack(baseLat, baseLon, scaleOffsets(shape, targetM), () => baseEle, startT, 20_000);
}

/**
 * The 24-point hill loop with a 60m climb over its first half: elevation
 * ramps up 7.5m/step for 8 steps, holds for 4, then descends 5m/step.
 * detectHill's non-decreasing-with-2m-dip-tolerance walk finds exactly one
 * qualifying segment (points 0-12: gain 60m >= 25m over ~934m, ~6.4% >= 3%).
 */
function hillLoopTrack(baseLat: number, baseLon: number, baseEle: number, startT: number): TrackPoint[] {
  const eleAt = (i: number): number => {
    if (i <= 8) return baseEle + i * 7.5;
    if (i <= 12) return baseEle + 60;
    return baseEle + 60 - (i - 12) * 5;
  };
  return offsetsToTrack(baseLat, baseLon, scaleOffsets(loopOffsets(), HILL_LOOP_TARGET_M), eleAt, startT, 30_000);
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
      track: shapedFlatTrack(riversideOffsets(), RIVERSIDE_TARGET_M, MUMBAI_LAT, MUMBAI_LON, 10, utcMs(2025, 3, 18, 7, 0, 0, IST)),
    }),

    // --- Place B (Lafayette): journey lands here ---
    makeRun({
      id: "r13-journey-land",
      y: 2025, mo: 4, d: 1, h: 8, mi: 0, s: 0, offsetHours: EDT, tz: TZ_LAFAYETTE,
      km: 6.0, minutes: 36, elevationGain: 15, placeId: PLACE_LAFAYETTE,
      track: shapedFlatTrack(blockOffsets(), BLOCKS_TARGET_M, 40.415, -86.925, 200, utcMs(2025, 4, 1, 8, 0, 0, EDT)),
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
      track: shapedFlatTrack(outAndBackOffsets(), OUT_AND_BACK_TARGET_M, 40.43, -86.9, 200, utcMs(2025, 6, 5, 7, 30, 0, EDT)),
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
