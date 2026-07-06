import type { StoryEvent } from "../../analyze/types";
import type { PoemLine } from "./forms";
import { localStampFor, weekdayOf } from "./features";

export interface PoemContext {
  name?: string;
  place?: string;
  placeLat?: number;
  placeLon?: number;
  /** first evidence run's local stamp — feature fallback for date-less events */
  startLocal?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Fill `{slot}` tokens from `values`; throws if a token has no value. */
export function fillSlots(line: string, values: Record<string, string>): string {
  return line.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`poems: unresolved slot {${key}}`);
    }
    return value;
  });
}

function num(v: string | number | boolean): number {
  return typeof v === "number" ? v : Number(v);
}

/** Format a pace in minutes-per-km as "M:SS /km" (e.g. 5.2 -> "5:12 /km"). */
function formatPace(minPerKm: number): string {
  let minutes = Math.floor(minPerKm);
  let seconds = Math.round((minPerKm - minutes) * 60);
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/**
 * Resolve the slot vocabulary from an event's data and the render context.
 * A slot key is present in the result ONLY when its source is present, so the
 * honesty filter in the selector can drop poems whose slots cannot be filled.
 */
export function slotValues(
  event: StoryEvent,
  ctx: PoemContext,
): Record<string, string> {
  const d = event.data;
  const v: Record<string, string> = {};

  if ("km" in d) v.km = num(d.km).toFixed(1);
  if ("days" in d) v.days = String(Math.round(num(d.days)));
  if ("count" in d) v.count = String(Math.round(num(d.count)));

  if ("month" in d) {
    const raw = String(d.month);
    const idx = Number(raw.slice(5, 7)) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < 12) {
      v.month = MONTH_NAMES[idx] as string;
    }
  }

  if ("paceMinPerKm" in d) v.pace = formatPace(num(d.paceMinPerKm));

  if ("localTime" in d) v.time = String(d.localTime);
  else if ("latestLocalTime" in d) v.time = String(d.latestLocalTime);

  const stamp = localStampFor(event, ctx);
  if (stamp.hm !== undefined) {
    const hour = Number(stamp.hm.slice(0, 2));
    v.clock = `${hour % 12 || 12}:${stamp.hm.slice(3, 5)}`;
  }
  if (stamp.date !== undefined) v.weekday = weekdayOf(stamp.date);

  if ("times" in d) v.times = String(Math.round(num(d.times)));

  if ("gainM" in d) v.gain = String(Math.round(num(d.gainM)));
  else if ("elevationGainM" in d) v.gain = String(Math.round(num(d.elevationGainM)));

  if (ctx.name !== undefined) v.name = ctx.name;
  if (ctx.place !== undefined) v.place = ctx.place;

  for (const key of ["startLocal", "month", "fromLocal", "fromDate"] as const) {
    if (key in d) {
      v.year = String(d[key]).slice(0, 4);
      break;
    }
  }

  return v;
}

/** Fill every line's {slot} tokens, preserving line modifiers. Empty lines
 *  (stanza gaps) pass through untouched. */
export function fillLines(
  lines: readonly PoemLine[],
  values: Record<string, string>,
): PoemLine[] {
  return lines.map((l) =>
    l.text === "" ? { ...l } : { ...l, text: fillSlots(l.text, values) },
  );
}
