import type { Rng } from "../rng";
import type { StoryEvent, StoryEventType } from "../../analyze/types";
import type { Band, CastId, ChapterPoem, PoemSpec } from "./forms";
import { fillLines, slotValues, type PoemContext } from "./slots";
import { featuresFor } from "./features";
import { realizeLines } from "./realize";

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

/** At most this many callback codas fire per book — they stay special. */
const CODA_CAP = 3;

export interface Selection {
  spec: PoemSpec;
  codaActive: boolean;
}

/** Book-scoped selector. Tracks picked poem ids (no poem repeats within a
 *  book), the cast introduced by earlier chapters, and how many callback
 *  codas have fired. buildBook iterates chapters chronologically, so "earlier
 *  chapter" is simply "an earlier call". */
export class PoemSelector {
  private readonly usedIds = new Set<string>();
  private readonly cast = new Set<CastId>();
  private codasActivated = 0;

  constructor(private readonly corpus: readonly PoemSpec[]) {}

  select(event: StoryEvent, values: Record<string, string>, r: Rng): Selection {
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

    // no repeats within a book; if the pool empties, allow repeats over throwing
    const fresh = cands.filter((p) => !this.usedIds.has(p.id));
    let pool = fresh.length > 0 ? fresh : cands;

    // prefer a poem whose callback can fire — the cast pays off
    const activatable = (p: PoemSpec) =>
      p.coda !== undefined && this.cast.has(p.coda.requires);
    if (this.codasActivated < CODA_CAP) {
      const codaTier = pool.filter(activatable);
      if (codaTier.length > 0) pool = codaTier;
    }

    const pick = r.pick(pool);
    const codaActive = activatable(pick) && this.codasActivated < CODA_CAP;
    if (codaActive) this.codasActivated++;

    // register the pick BEFORE its introductions: a poem never satisfies
    // its own coda, only a strictly earlier chapter can
    this.usedIds.add(pick.id);
    for (const c of pick.introduces ?? []) this.cast.add(c);

    return { spec: pick, codaActive };
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
  const { spec, codaActive } = selector.select(event, values, r);
  const features = featuresFor(event, ctx, bandFor(event) ?? undefined);
  const poem: ChapterPoem = {
    id: spec.id,
    form: spec.form,
    lines: fillLines(realizeLines(spec.lines, features), values),
  };
  if (codaActive && spec.coda) poem.coda = fillLines(spec.coda.lines, values);
  return poem;
}
