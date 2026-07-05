import type { Run, Year } from "../ingest/types";
import type { StoryEvent } from "./types";

function sortByStartUtc(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => a.startUtc - b.startUtc);
}

function localSecondsOfDay(startLocal: string): number {
  const t = startLocal.slice(11); // "HH:MM:SS"
  const h = Number(t.slice(0, 2));
  const m = Number(t.slice(3, 5));
  const s = Number(t.slice(6, 8));
  return h * 3600 + m * 60 + s;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatHM(secondsOfDay: number): string {
  const h = Math.floor(secondsOfDay / 3600);
  const m = Math.floor((secondsOfDay % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
}

/**
 * Proleptic-Gregorian day number for a "YYYY-MM-DD" string (Howard Hinnant's
 * days_from_civil). Pure integer arithmetic — no Date object, no timezone or
 * locale dependency, safe for any y/m/d including leap years and month ends.
 */
function daysFromCivil(dateStr: string): number {
  const [yRaw, mRaw, dRaw] = dateStr.split("-").map(Number);
  const m = mRaw!;
  const d = dRaw!;
  const y = yRaw! - (m <= 2 ? 1 : 0);
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146_097 + doe - 719_468;
}

/** Whole calendar days between two "YYYY-MM-DD" local date strings. */
function daysBetween(dateA: string, dateB: string): number {
  return daysFromCivil(dateB) - daysFromCivil(dateA);
}

export function detectFirstLast(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const toEvent = (type: "first-run" | "last-run", run: Run): StoryEvent => ({
    type,
    runIds: [run.id],
    atUtc: run.startUtc,
    magnitude: run.km,
    data: { km: run.km, startLocal: run.startLocal, placeId: run.placeId ?? "" },
  });
  return [toEvent("first-run", first), toEvent("last-run", last)];
}

export function detectRecords(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);
  const events: StoryEvent[] = [];

  const longestPool = sorted.filter((r) => r.km > 0);
  if (longestPool.length > 0) {
    let best = longestPool[0]!;
    for (const r of longestPool.slice(1)) {
      if (r.km > best.km) best = r;
    }
    events.push({
      type: "longest-run",
      runIds: [best.id],
      atUtc: best.startUtc,
      magnitude: best.km,
      data: { km: best.km, startLocal: best.startLocal },
    });
  }

  const fastestPool = sorted.filter((r) => r.km >= 3 && r.minutes > 0);
  if (fastestPool.length > 0) {
    let best = fastestPool[0]!;
    let bestPace = best.minutes / best.km;
    for (const r of fastestPool.slice(1)) {
      const pace = r.minutes / r.km;
      if (pace < bestPace) {
        best = r;
        bestPace = pace;
      }
    }
    events.push({
      type: "fastest-run",
      runIds: [best.id],
      atUtc: best.startUtc,
      magnitude: bestPace,
      data: { paceMinPerKm: bestPace, km: best.km, startLocal: best.startLocal },
    });
  }

  const hillyPool = sorted.filter((r) => r.elevationGain > 0);
  if (hillyPool.length > 0) {
    let best = hillyPool[0]!;
    for (const r of hillyPool.slice(1)) {
      if (r.elevationGain > best.elevationGain) best = r;
    }
    events.push({
      type: "hilliest-run",
      runIds: [best.id],
      atUtc: best.startUtc,
      magnitude: best.elevationGain,
      data: { elevationGainM: best.elevationGain, startLocal: best.startLocal },
    });
  }

  const timePool = sorted.filter((r) => !r.timezoneUncertain);
  if (timePool.length > 0) {
    let earliest = timePool[0]!;
    let earliestSecs = localSecondsOfDay(earliest.startLocal);
    let latest = timePool[0]!;
    let latestSecs = earliestSecs;
    for (const r of timePool.slice(1)) {
      const secs = localSecondsOfDay(r.startLocal);
      if (secs < earliestSecs) {
        earliest = r;
        earliestSecs = secs;
      }
      if (secs > latestSecs) {
        latest = r;
        latestSecs = secs;
      }
    }
    events.push({
      type: "earliest-run",
      runIds: [earliest.id],
      atUtc: earliest.startUtc,
      magnitude: earliestSecs,
      data: { localTime: formatHM(earliestSecs), startLocal: earliest.startLocal },
    });
    events.push({
      type: "latest-run",
      runIds: [latest.id],
      atUtc: latest.startUtc,
      magnitude: latestSecs,
      data: { localTime: formatHM(latestSecs), startLocal: latest.startLocal },
    });
  }

  return events;
}

function nightShiftedSeconds(run: Run): number {
  const secs = localSecondsOfDay(run.startLocal);
  return (secs - 22 * 3600 + 86_400) % 86_400;
}

export function detectNightRuns(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);
  const nightRuns = sorted.filter((r) => {
    if (r.timezoneUncertain) return false;
    const hour = Number(r.startLocal.slice(11, 13));
    return hour >= 22 || hour < 4;
  });
  if (nightRuns.length === 0) return [];

  let latest = nightRuns[0]!;
  let latestShifted = nightShiftedSeconds(latest);
  for (const r of nightRuns.slice(1)) {
    const shifted = nightShiftedSeconds(r);
    if (shifted > latestShifted) {
      latest = r;
      latestShifted = shifted;
    }
  }

  return [
    {
      type: "night-runs",
      runIds: nightRuns.map((r) => r.id),
      atUtc: nightRuns[0]!.startUtc,
      magnitude: nightRuns.length,
      data: {
        count: nightRuns.length,
        latestLocalTime: formatHM(localSecondsOfDay(latest.startLocal)),
        latestStartLocal: latest.startLocal,
      },
    },
  ];
}

export function detectQuiets(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);
  const events: StoryEvent[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const earlier = sorted[i - 1]!;
    const later = sorted[i]!;
    const gapMs = later.startUtc - earlier.startUtc;
    if (gapMs > 21 * 86_400_000) {
      const days = Math.floor(gapMs / 86_400_000);
      events.push({
        type: "quiet",
        runIds: [earlier.id, later.id],
        atUtc: earlier.startUtc,
        magnitude: days,
        data: { days, fromLocal: earlier.startLocal, toLocal: later.startLocal },
      });
    }
  }
  return events;
}

interface DateGroup {
  date: string;
  runs: Run[];
}

export function detectStreaks(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);

  const groups: DateGroup[] = [];
  for (const r of sorted) {
    const date = r.startLocal.slice(0, 10);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.date === date) {
      lastGroup.runs.push(r);
    } else {
      groups.push({ date, runs: [r] });
    }
  }

  const events: StoryEvent[] = [];
  let i = 0;
  while (i < groups.length) {
    let j = i;
    while (j + 1 < groups.length && daysBetween(groups[j]!.date, groups[j + 1]!.date) === 1) {
      j++;
    }
    const streakLen = j - i + 1;
    if (streakLen >= 5) {
      const streakGroups = groups.slice(i, j + 1);
      const runIds = streakGroups.flatMap((g) => g.runs.map((r) => r.id));
      events.push({
        type: "streak",
        runIds,
        atUtc: streakGroups[0]!.runs[0]!.startUtc,
        magnitude: streakLen,
        data: {
          days: streakLen,
          fromDate: streakGroups[0]!.date,
          toDate: streakGroups[streakGroups.length - 1]!.date,
        },
      });
    }
    i = j + 1;
  }
  return events;
}

export function detectFalseStarts(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);
  const shortRuns = sorted.filter((r) => r.km > 0 && r.km < 1);
  if (shortRuns.length === 0) return [];

  let shortest = shortRuns[0]!;
  for (const r of shortRuns.slice(1)) {
    if (r.km < shortest.km) shortest = r;
  }

  return [
    {
      type: "false-starts",
      runIds: shortRuns.map((r) => r.id),
      atUtc: shortRuns[0]!.startUtc,
      magnitude: shortRuns.length,
      data: {
        count: shortRuns.length,
        shortestKm: shortest.km,
        shortestStartLocal: shortest.startLocal,
      },
    },
  ];
}

export function detectMonths(year: Year): StoryEvent[] {
  if (year.runs.length === 0) return [];
  const sorted = sortByStartUtc(year.runs);

  const byMonth = new Map<string, Run[]>();
  for (const r of sorted) {
    const month = r.startLocal.slice(0, 7);
    const existing = byMonth.get(month);
    if (existing) existing.push(r);
    else byMonth.set(month, [r]);
  }

  const months = [...byMonth.keys()].sort();
  return months.map((month) => {
    const runs = byMonth.get(month)!;
    const km = runs.reduce((sum, r) => sum + r.km, 0);
    const bestKm = Math.max(...runs.map((r) => r.km));
    const atUtc = Math.min(...runs.map((r) => r.startUtc));
    return {
      type: "month",
      runIds: runs.map((r) => r.id),
      atUtc,
      magnitude: km,
      data: { month, runs: runs.length, km, bestKm },
    };
  });
}
