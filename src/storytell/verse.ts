import type { Rng } from "./rng";
import type { StoryEvent } from "../analyze/types";
import { COUPLETS } from "./fragments";
import type { Couplet } from "./fragments";

export interface VerseContext {
  name?: string;
  place?: string;
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
      throw new Error(`verse: unresolved slot {${key}}`);
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
 * honesty filter in verseFor can drop couplets whose slots cannot be filled.
 */
export function slotValues(
  event: StoryEvent,
  ctx: VerseContext,
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

const SLOT_RE = /\{(\w+)\}/g;

function slotsIn(couplet: Couplet): string[] {
  const keys: string[] = [];
  for (const line of [couplet.a, couplet.b]) {
    for (const m of line.matchAll(SLOT_RE)) {
      const key = m[1];
      if (key !== undefined) keys.push(key);
    }
  }
  return keys;
}

function resolvable(couplet: Couplet, values: Record<string, string>): boolean {
  return slotsIn(couplet).every((k) => values[k] !== undefined);
}

/**
 * A 4-6 line poem for one event: an open couplet, an optional data couplet
 * (included only when its slots resolve), and a close couplet. Selection is
 * deterministic — the rng is forked by the event's type and start time — and
 * every slot in the returned lines is filled.
 */
export function verseFor(
  event: StoryEvent,
  ctx: VerseContext,
  rng: Rng,
): string[] {
  const r = rng.fork(`verse:${event.type}:${event.atUtc}`);
  const values = slotValues(event, ctx);

  const opens = COUPLETS.filter(
    (c) => c.role === "open" && c.kinds.includes(event.type),
  );
  const datas = COUPLETS.filter(
    (c) =>
      c.role === "data" &&
      c.kinds.includes(event.type) &&
      resolvable(c, values),
  );
  const closes = COUPLETS.filter(
    (c) => c.role === "close" && c.kinds.includes(event.type),
  );

  if (opens.length === 0 || closes.length === 0) {
    throw new Error(
      `verse: no open/close couplet for event type "${event.type}"`,
    );
  }

  const open = r.pick(opens);
  const data = datas.length > 0 ? r.pick(datas) : undefined;
  const close = r.pick(closes);

  const lines: string[] = [fillSlots(open.a, values), fillSlots(open.b, values)];
  if (data !== undefined) {
    lines.push(fillSlots(data.a, values), fillSlots(data.b, values));
  }
  lines.push(fillSlots(close.a, values), fillSlots(close.b, values));
  return lines;
}
