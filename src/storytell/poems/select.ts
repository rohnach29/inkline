import type { Rng } from "../rng";
import type { StoryEvent, StoryEventType } from "../../analyze/types";
import type { Band, ChapterPoem, PoemForm, PoemSpec } from "./forms";
import { fillPoemLines, slotValues, type PoemContext } from "./slots";

/** magnitude bounds per banded type; `invert` = lower magnitude is the
 *  bigger feat (pace). small: m < lo · medium: lo ≤ m ≤ hi · large: m > hi */
const BAND_BOUNDS: Partial<Record<StoryEventType, { lo: number; hi: number; invert?: boolean }>> = {
  "longest-run": { lo: 8, hi: 18 },
  "fastest-run": { lo: 5.0, hi: 6.5, invert: true },
  "hilliest-run": { lo: 60, hi: 150 },
  "hill-beast": { lo: 60, hi: 150 },
  streak: { lo: 5, hi: 10 },
  quiet: { lo: 21, hi: 60 },
  journey: { lo: 2000, hi: 7000 },
  month: { lo: 40, hi: 90 },
  "night-runs": { lo: 3, hi: 6 },
  "false-starts": { lo: 3, hi: 5 },
  "route-champion": { lo: 4, hi: 8 },
};

export function bandFor(event: StoryEvent): Band | null {
  const b = BAND_BOUNDS[event.type];
  if (!b) return null;
  const m = event.magnitude;
  const low = m < b.lo;
  const high = m > b.hi;
  if (b.invert) return high ? "small" : low ? "large" : "medium";
  return low ? "small" : high ? "large" : "medium";
}

/** Book-scoped selector: tracks which forms this book has used so no form
 *  repeats while unused forms remain; past that, least-recently-used wins. */
export class PoemSelector {
  private readonly used = new Map<PoemForm, number>();
  private seq = 0;

  constructor(private readonly corpus: readonly PoemSpec[]) {}

  select(event: StoryEvent, values: Record<string, string>, r: Rng): PoemSpec {
    const band = bandFor(event);
    const eligible = (anyBand: boolean) =>
      this.corpus.filter(
        (p) =>
          p.kind === event.type &&
          (anyBand || p.band === "any" || p.band === band) &&
          p.slots.every((s) => values[s] !== undefined),
      );
    let cands = eligible(false);
    if (cands.length === 0) cands = eligible(true);
    if (cands.length === 0) throw new Error(`poems: no candidate for "${event.type}"`);

    const unused = cands.filter((p) => !this.used.has(p.form));
    let pool = unused;
    if (pool.length === 0) {
      const oldest = Math.min(...cands.map((p) => this.used.get(p.form)!));
      pool = cands.filter((p) => this.used.get(p.form) === oldest);
    }
    const pick = r.pick(pool);
    this.used.set(pick.form, this.seq++);
    return pick;
  }
}

export function poemFor(
  selector: PoemSelector,
  event: StoryEvent,
  ctx: PoemContext,
  rng: Rng,
): ChapterPoem {
  const r = rng.fork(`poem:${event.type}:${event.atUtc}`);
  const values = slotValues(event, ctx);
  const spec = selector.select(event, values, r);
  return { form: spec.form, lines: fillPoemLines(spec, values) };
}
