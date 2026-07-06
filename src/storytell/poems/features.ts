import type { StoryEvent } from "../../analyze/types";
import type { Band } from "./forms";

export const HOUR_BANDS = ["dawn", "morning", "day", "evening", "night"] as const;
export type HourBand = (typeof HOUR_BANDS)[number];

export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter", "monsoon"] as const;
export type Season = (typeof SEASONS)[number];

/** Everything a poem branch may condition on. Any field may be undefined
 *  when the underlying data is missing; conditions on it then never match. */
export interface PoemFeatures {
  hourBand?: HourBand;
  weekday?: Weekday;
  season?: Season;
  band?: Band;
}

/** The slice of the render context features need; PoemContext satisfies it. */
export interface FeatureContext {
  placeLat?: number;
  placeLon?: number;
  startLocal?: string;
}

/**
 * Best local timestamp for an event, from its data in priority order, falling
 * back to the context's evidence-run stamp. `date` is "YYYY-MM-DD"; `hm` is
 * "HH:MM" and absent for date-only sources (streak's fromDate).
 */
export function localStampFor(
  event: StoryEvent,
  ctx: FeatureContext,
): { date?: string; hm?: string } {
  const d = event.data;
  for (const key of ["startLocal", "latestStartLocal", "shortestStartLocal", "fromLocal"] as const) {
    if (key in d) return splitStamp(String(d[key]));
  }
  if ("fromDate" in d) return { date: String(d.fromDate).slice(0, 10) };
  if (ctx.startLocal !== undefined) return splitStamp(ctx.startLocal);
  return {};
}

function splitStamp(stamp: string): { date?: string; hm?: string } {
  const date = stamp.slice(0, 10);
  const hm = stamp.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hm) ? { date, hm } : { date };
}

/** dawn [04,07) · morning [07,11) · day [11,17) · evening [17,21) · night otherwise. */
export function hourBandOf(hm: string): HourBand {
  const hour = Number(hm.slice(0, 2));
  if (hour >= 4 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Weekday of a "YYYY-MM-DD" date via Sakamoto's algorithm — pure integer
 *  math, no Date object, no locale, no timezone. */
export function weekdayOf(date: string): Weekday {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
  const y = month < 3 ? year - 1 : year;
  const idx =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offsets[month - 1]! + day) % 7;
  return WEEKDAYS[idx]!;
}

/** South Asian monsoon belt; shared with the atmosphere layer in book.ts. */
export function isMonsoonRegion(lat: number, lon: number): boolean {
  return lat >= 8 && lat <= 25 && lon >= 68 && lon <= 90;
}

/**
 * Meteorological season for a month (1-12) at a latitude, hemisphere-flipped
 * south of the equator. In the monsoon belt (lon required), June-September is
 * "monsoon" instead of the hemisphere season.
 */
export function seasonOf(month: number, lat: number, lon?: number): Season {
  if (lon !== undefined && isMonsoonRegion(lat, lon) && month >= 6 && month <= 9) {
    return "monsoon";
  }
  const north =
    month >= 3 && month <= 5 ? "spring"
    : month >= 6 && month <= 8 ? "summer"
    : month >= 9 && month <= 11 ? "autumn"
    : "winter";
  if (lat >= 0) return north;
  const flip: Record<string, Season> = {
    spring: "autumn", summer: "winter", autumn: "spring", winter: "summer",
  };
  return flip[north]!;
}

/**
 * Compute the branchable features for an event. Every field degrades to
 * undefined when its source data is missing — a branch conditioned on it then
 * falls to its default lines. `band` is passed in by the caller (the selector
 * owns band logic) to keep this module import-cycle free.
 */
export function featuresFor(
  event: StoryEvent,
  ctx: FeatureContext,
  band?: Band,
): PoemFeatures {
  const stamp = localStampFor(event, ctx);
  const f: PoemFeatures = {};

  if (stamp.hm !== undefined) f.hourBand = hourBandOf(stamp.hm);
  if (stamp.date !== undefined) f.weekday = weekdayOf(stamp.date);

  const monthSource = stamp.date ?? ("month" in event.data ? String(event.data.month) : undefined);
  if (monthSource !== undefined && ctx.placeLat !== undefined) {
    const month = Number(monthSource.slice(5, 7));
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      f.season = seasonOf(month, ctx.placeLat, ctx.placeLon);
    }
  }

  if (band !== undefined) f.band = band;
  return f;
}
