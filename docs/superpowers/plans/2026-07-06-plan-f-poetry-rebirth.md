# Plan F — Poetry Rebirth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the couplet-assembly verse engine with a ~150-poem authored corpus in 9 distinct forms (with a no-form-repeats-per-book selector and magnitude-band registers), and delete the game.

**Architecture:** A new `src/storytell/poems/` package owns the poem model (`forms.ts`), slot filling (`slots.ts`), selection (`select.ts`), and the corpus (one module per event type). `Chapter.verse: string[]` becomes `Chapter.poem: ChapterPoem`; `pages.ts` renders per form. The old `verse.ts`/`fragments.ts`/`rhyme.ts` engine and all of `src/game/` are deleted.

**Tech Stack:** TypeScript strict, Vitest, existing seeded `Rng` (`src/storytell/rng.ts`). No new dependencies.

## Global Constraints

- Deterministic: same export → identical Book. No `Date.now`, `Math.random`, or locale-dependent formatting in core. All randomness through `Rng` with `fork(label)`.
- Runtime deps stay exactly `fflate` + `tz-lookup`.
- The chapter poem fork label is exactly `` `poem:${event.type}:${event.atUtc}` ``.
- Honesty: a poem may only state numbers the chapter's data supports; a `{slot}` renders only from `slotValues` output; unresolved slot = hard error.
- No form repeats within a book while unused forms remain (9 forms: quatrain, quip, list, dialogue, letter, notice, spell, concrete, narrative).
- Corpus floors (lint-enforced): ≥8 poems per event type; banded types: per band ≥3 eligible poems (band match or `"any"`) in ≥3 distinct forms; any-only types: ≥4 distinct forms; every type: ≥2 poems whose slots ⊆ `SAFE_SLOTS[kind]`; no duplicated line text (>12 chars) corpus-wide; every filled line ≤60 chars under `WORST_CASE` values.
- Line-count bounds per form (non-empty lines): quatrain 4–12, quip 2–4, list 5–12, dialogue 6–14, letter 6–14, notice 4–10, spell 5–12, concrete 5–16, narrative 12–20.
- `voice` appears only in dialogue poems (both voices present); `size` only in concrete poems.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Subagents never push; the controller pushes.
- Poem register: Shel Silverstein — concrete images, kid-logic, a wry turn, real feeling under the joke. Never saccharine, never motivational-poster.

## File Structure

```
src/storytell/poems/
  forms.ts        # PoemForm/PoemLine/ChapterPoem/PoemSpec/SlotName/Band + FORM_RULES/SAFE_SLOTS/WORST_CASE
  slots.ts        # PoemContext, fillSlots, slotValues, fillPoemLines (slot vocabulary, moved from verse.ts)
  select.ts       # bandFor, PoemSelector (form-diversity + LRU), poemFor
  index.ts        # CORPUS aggregate + COVERED_KINDS
  first-run.ts … ghost-elevation.ts   # 16 corpus modules (Tasks 3–4)
  forms.test.ts   # corpus lint suite
  select.test.ts  # selector behavior on fixture corpus
DELETED: src/game/ (13 files), src/storytell/{verse,fragments,rhyme}.ts + {verse,rhyme}.test.ts
```

---

### Task 1: Remove the game

**Files:**
- Delete: `src/game/` (all 13 files)
- Modify: `src/render/pages.ts` (lines 29–31 GAME_* consts, 204–217 `renderGamePage`, 257 `parts.push(renderGamePage())`)
- Modify: `src/app/main.ts` (lines 15–16 imports, 32–34 `gameHandle` decl, 204–220 init block + `#game` scroll, 224–231 teardown refs, 408–412 boot `#game` hash)
- Modify: `src/render/theme.css` (`.page-game`, `.game-how-to` rules at ~139–147)
- Modify: `src/app/shell.css` (section 11, `.game-*` rules from ~line 282 to end of that section)
- Modify: `README.md` (remove every mention of the game/"Outrun the Quiet")
- Test: `src/render/pages.test.ts`

**Interfaces:**
- Consumes: current `renderBook(book, year)`.
- Produces: `renderBook` output ends `…beasts → colophon`, contains no `page-game`/`game-mount` markup. `main.ts` has no game symbols. Later tasks rely on `pages.ts` having no game code.

- [ ] **Step 1: Flip the test.** In `src/render/pages.test.ts`, find the game-page assertions (search `page-game`, `game-mount`, `Outrun`) and replace them with:

```ts
it("renders no game page", () => {
  const html = renderBook(book, year);
  expect(html).not.toContain("page-game");
  expect(html).not.toContain("game-mount");
  expect(html).not.toContain("Outrun the Quiet");
});
```

(Reuse whatever `book`/`year` fixture the existing game test used.)

- [ ] **Step 2: Run to verify it fails.** `npx vitest run src/render/pages.test.ts` — expect the new test FAILS (game page still rendered).
- [ ] **Step 3: Remove game rendering.** In `pages.ts` delete `GAME_KICKER`/`GAME_TITLE`/`GAME_HOW_TO`, `renderGamePage()`, and the `parts.push(renderGamePage());` line.
- [ ] **Step 4: Remove game wiring.** In `main.ts` delete the two game imports, the `gameHandle` declaration and every reference to it (the init try/catch block, the teardown lines), and both `#game` hash handlers (the in-book scroll and the boot-time skip). The hash now does nothing — the app boots to the cover.
- [ ] **Step 5: Delete the code and styles.** `git rm -r src/game`. Remove `.page-game`/`.game-how-to` from `theme.css` and the whole `.game-*` section from `shell.css`. Remove game copy from `README.md`.
- [ ] **Step 6: Sweep for stragglers.** `grep -rn "game\|Game" src/ index.html README.md --include="*.ts" --include="*.css" --include="*.html" -l` — expect zero matches in app code (comments in unrelated words like "endgame" don't exist; if any match remains, remove it).
- [ ] **Step 7: Full verification.** `npx tsc --noEmit` → 0 errors. `npx vitest run` → all remaining tests pass (game tests are gone with `src/game/`). `npx vite build` → success.
- [ ] **Step 8: Commit** `git add -A && git commit -m "feat!: remove Outrun the Quiet game"`.

---

### Task 2: Poem model, slot vocabulary, and selection engine

**Files:**
- Create: `src/storytell/poems/forms.ts`, `src/storytell/poems/slots.ts`, `src/storytell/poems/select.ts`, `src/storytell/poems/index.ts`
- Test: `src/storytell/poems/forms.test.ts`, `src/storytell/poems/select.test.ts`

**Interfaces:**
- Consumes: `Rng` from `../rng` (`fork`, `pick`), `StoryEvent`/`StoryEventType` from `../../analyze/types`. `slotValues` behavior copied verbatim from `src/storytell/verse.ts:47-85` (do not change semantics; `verse.ts` itself is deleted in Task 5).
- Produces (Tasks 3–6 rely on these exact names):
  - `forms.ts`: `PoemForm`, `POEM_FORMS`, `Mood`, `PoemLine`, `ChapterPoem`, `SlotName`, `Band`, `PoemSpec`, `FORM_RULES`, `SAFE_SLOTS`, `WORST_CASE`
  - `slots.ts`: `PoemContext`, `fillSlots(line, values): string`, `slotValues(event, ctx): Record<string,string>`, `fillPoemLines(spec, values): PoemLine[]`
  - `select.ts`: `bandFor(event): Band | null`, `class PoemSelector { constructor(corpus: readonly PoemSpec[]); select(event, values, r: Rng): PoemSpec }`, `poemFor(selector, event, ctx, rng): ChapterPoem`
  - `index.ts`: `CORPUS: readonly PoemSpec[]`, `COVERED_KINDS: readonly StoryEventType[]` (both empty until Tasks 3–4)

- [ ] **Step 1: Write `forms.ts`** (complete file):

```ts
import type { StoryEventType } from "../../analyze/types";

export const POEM_FORMS = [
  "quatrain", "quip", "list", "dialogue", "letter",
  "notice", "spell", "concrete", "narrative",
] as const;
export type PoemForm = (typeof POEM_FORMS)[number];

/** Carried over from the retired fragments.ts — same union, new home. */
export type Mood = "triumphant" | "sheepish" | "nocturnal" | "quiet" | "absurd" | "steady";

export interface PoemLine {
  /** may contain {slot} tokens in a PoemSpec; empty string = stanza gap */
  text: string;
  voice?: 1 | 2;                        // dialogue only
  indent?: 0 | 1 | 2 | 3;               // hanging/stepped indentation
  align?: "left" | "center" | "right";  // default left
  size?: "small" | "normal" | "large";  // concrete only; default normal
}

export interface ChapterPoem {
  form: PoemForm;
  lines: PoemLine[];
}

export type SlotName =
  | "km" | "days" | "count" | "month" | "pace"
  | "time" | "gain" | "name" | "place" | "year";

export type Band = "small" | "medium" | "large";

export interface PoemSpec {
  /** `${kind}/${slug}`, unique corpus-wide */
  id: string;
  kind: StoryEventType;
  form: PoemForm;
  band: Band | "any";
  mood: Mood;
  /** exactly the slots the lines reference — no more, no less */
  slots: readonly SlotName[];
  lines: PoemLine[];
}

/** Bounds on NON-EMPTY line count per form. */
export const FORM_RULES: Record<PoemForm, { min: number; max: number }> = {
  quatrain: { min: 4, max: 12 },
  quip: { min: 2, max: 4 },
  list: { min: 5, max: 12 },
  dialogue: { min: 6, max: 14 },
  letter: { min: 6, max: 14 },
  notice: { min: 4, max: 10 },
  spell: { min: 5, max: 12 },
  concrete: { min: 5, max: 16 },
  narrative: { min: 12, max: 20 },
};

/** Slots guaranteed resolvable for each event type (from analyze data shapes
 *  + book.ts naming: `name` is set exactly for NAMED_ENTITY_TYPES). A poem
 *  whose slots ⊆ SAFE_SLOTS[kind] can never be filtered out by honesty. */
export const SAFE_SLOTS: Record<StoryEventType, readonly SlotName[]> = {
  "first-run": ["km", "year"],
  "last-run": ["km", "year"],
  "longest-run": ["km", "year"],
  "fastest-run": ["pace", "km", "year"],
  "hilliest-run": ["gain", "year"],
  "earliest-run": ["time", "year"],
  "latest-run": ["time", "year"],
  "night-runs": ["count", "time", "name"],
  "false-starts": ["count"],
  quiet: ["days", "year", "name"],
  streak: ["days", "year"],
  journey: ["km"],
  month: ["month", "km", "year"],
  "route-champion": ["count", "km", "name"],
  "hill-beast": ["gain", "name"],
  "ghost-elevation": ["gain", "name"],
};

/** Longest plausible fill per slot — the lint suite renders every line with
 *  these and enforces the 60-char layout bound. */
export const WORST_CASE: Record<SlotName, string> = {
  km: "999.9",
  days: "365",
  count: "99",
  month: "September",
  pace: "12:59 /km",
  time: "23:59",
  gain: "9999",
  name: "The Everlasting Quiet Returns",
  place: "West Lafayette",
  year: "2026",
};
```

- [ ] **Step 2: Write `slots.ts`.** Copy `fillSlots` (verse.ts:17-25), `formatPace` + `num` helpers (verse.ts:27-40), `MONTH_NAMES` (verse.ts:11-14), and `slotValues` (verse.ts:47-85) **verbatim** into `slots.ts`, renaming `VerseContext` → `PoemContext` (same shape: `{ name?: string; place?: string }`). Then add:

```ts
import type { PoemLine, PoemSpec } from "./forms";

/** Fill every line's {slot} tokens, preserving line modifiers. Empty lines
 *  (stanza gaps) pass through untouched. */
export function fillPoemLines(
  spec: PoemSpec,
  values: Record<string, string>,
): PoemLine[] {
  return spec.lines.map((l) =>
    l.text === "" ? { ...l } : { ...l, text: fillSlots(l.text, values) },
  );
}
```

- [ ] **Step 3: Write the failing selector tests** in `select.test.ts` (complete file; the fixture corpus lives inline and is NOT registered in `index.ts`):

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../rng";
import type { StoryEvent } from "../../analyze/types";
import type { PoemSpec } from "./forms";
import { PoemSelector, bandFor, poemFor } from "./select";

const mk = (kind: string, slug: string, form: PoemSpec["form"], band: PoemSpec["band"], slots: PoemSpec["slots"] = []): PoemSpec => ({
  id: `${kind}/${slug}`, kind: kind as PoemSpec["kind"], form, band, mood: "steady", slots,
  lines: [{ text: slots.length ? `a line with {${slots[0]}}` : "a plain line" }],
});

const ev = (type: string, atUtc: number, magnitude: number, data: StoryEvent["data"] = {}): StoryEvent =>
  ({ type: type as StoryEvent["type"], runIds: [], atUtc, magnitude, data });

const FIX: PoemSpec[] = [
  mk("longest-run", "a", "quatrain", "any"),
  mk("longest-run", "b", "quip", "any"),
  mk("longest-run", "c", "list", "any"),
  mk("longest-run", "d", "letter", "any"),
  mk("longest-run", "epic", "narrative", "large"),
  mk("quiet", "e", "quatrain", "any"),
];

describe("bandFor", () => {
  it("maps magnitude to bands with type-specific bounds", () => {
    expect(bandFor(ev("longest-run", 1, 5))).toBe("small");
    expect(bandFor(ev("longest-run", 1, 12))).toBe("medium");
    expect(bandFor(ev("longest-run", 1, 33.4))).toBe("large");
  });
  it("inverts for fastest-run (lower pace = bigger deal)", () => {
    expect(bandFor(ev("fastest-run", 1, 7.1))).toBe("small");
    expect(bandFor(ev("fastest-run", 1, 5.5))).toBe("medium");
    expect(bandFor(ev("fastest-run", 1, 4.4))).toBe("large");
  });
  it("returns null for any-only types", () => {
    expect(bandFor(ev("first-run", 1, 3))).toBeNull();
  });
});

describe("PoemSelector", () => {
  it("never repeats a form while unused forms remain", () => {
    const s = new PoemSelector(FIX);
    const r = new Rng(7);
    const forms = [1, 2, 3, 4].map((t) => s.select(ev("longest-run", t, 10), {}, r.fork(`t${t}`)).form);
    expect(new Set(forms).size).toBe(4);
  });
  it("falls back to least-recently-used form when all candidate forms are used", () => {
    const s = new PoemSelector(FIX.slice(0, 2)); // quatrain + quip only
    const r = new Rng(7);
    const first = s.select(ev("longest-run", 1, 10), {}, r.fork("1")).form;
    s.select(ev("longest-run", 2, 10), {}, r.fork("2"));
    expect(s.select(ev("longest-run", 3, 10), {}, r.fork("3")).form).toBe(first);
  });
  it("routes a small event away from large-band poems", () => {
    const s = new PoemSelector(FIX);
    const r = new Rng(7);
    for (let t = 1; t <= 4; t++) {
      expect(s.select(ev("longest-run", t, 5), {}, r.fork(`t${t}`)).id).not.toBe("longest-run/epic");
    }
  });
  it("relaxes band before giving up, throws only with zero candidates", () => {
    const s = new PoemSelector([mk("longest-run", "only", "quip", "large")]);
    expect(s.select(ev("longest-run", 1, 5), {}, new Rng(1)).id).toBe("longest-run/only");
    const empty = new PoemSelector([]);
    expect(() => empty.select(ev("longest-run", 1, 5), {}, new Rng(1))).toThrow(/no candidate/);
  });
  it("drops poems whose slots don't resolve (honesty)", () => {
    const s = new PoemSelector([mk("longest-run", "needy", "quip", "any", ["name"]), mk("longest-run", "safe", "list", "any")]);
    expect(s.select(ev("longest-run", 1, 10), {}, new Rng(1)).id).toBe("longest-run/safe");
  });
});

describe("poemFor", () => {
  it("is deterministic and fills every slot", () => {
    const e = ev("longest-run", 99, 21, { km: 21.4, startLocal: "2025-10-27T10:49:00" });
    const run = () => poemFor(new PoemSelector([mk("longest-run", "k", "quip", "any", ["km"])]), e, {}, new Rng(42));
    const a = run();
    expect(a).toEqual(run());
    expect(a.lines[0]!.text).toContain("21.4");
    expect(a.lines[0]!.text).not.toContain("{");
  });
});
```

- [ ] **Step 4: Run to verify failure.** `npx vitest run src/storytell/poems/select.test.ts` — FAILS (`select.ts` doesn't exist).
- [ ] **Step 5: Write `select.ts`** (complete file):

```ts
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
```

- [ ] **Step 6: Write `index.ts`:**

```ts
import type { StoryEventType } from "../../analyze/types";
import type { PoemSpec } from "./forms";

/** Corpus modules register here as Tasks 3–4 land them. */
export const CORPUS: readonly PoemSpec[] = [];

/** Kinds whose corpus is complete — the lint floors run per kind listed. */
export const COVERED_KINDS: readonly StoryEventType[] = [];

export * from "./forms";
export * from "./slots";
export * from "./select";
```

- [ ] **Step 7: Write the corpus lint suite** in `forms.test.ts` (complete file — passes trivially now, becomes the corpus gate in Tasks 3–4):

```ts
import { describe, expect, it } from "vitest";
import { CORPUS, COVERED_KINDS } from "./index";
import { FORM_RULES, POEM_FORMS, SAFE_SLOTS, WORST_CASE, type Band, type PoemSpec } from "./forms";
import { fillSlots } from "./slots";

const SLOT_RE = /\{(\w+)\}/g;
const byKind = (k: string) => CORPUS.filter((p) => p.kind === k);
const nonEmpty = (p: PoemSpec) => p.lines.filter((l) => l.text !== "");
const tokensOf = (p: PoemSpec) => new Set(nonEmpty(p).flatMap((l) => [...l.text.matchAll(SLOT_RE)].map((m) => m[1]!)));
const BANDS: Band[] = ["small", "medium", "large"];
const bandEligible = (k: string, b: Band) => byKind(k).filter((p) => p.band === "any" || p.band === b);
const BANDED = new Set(["longest-run","fastest-run","hilliest-run","hill-beast","streak","quiet","journey","month","night-runs","false-starts","route-champion"]);

describe("corpus structure", () => {
  it("ids are unique and `${kind}/${slug}`-shaped", () => {
    const ids = CORPUS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of CORPUS) expect(p.id.startsWith(`${p.kind}/`)).toBe(true);
  });
  it("declared slots exactly match tokens used", () => {
    for (const p of CORPUS) {
      expect([...tokensOf(p)].sort(), p.id).toEqual([...p.slots].sort());
    }
  });
  it("line counts within FORM_RULES", () => {
    for (const p of CORPUS) {
      const n = nonEmpty(p).length;
      const r = FORM_RULES[p.form];
      expect(n, `${p.id} (${p.form})`).toBeGreaterThanOrEqual(r.min);
      expect(n, `${p.id} (${p.form})`).toBeLessThanOrEqual(r.max);
    }
  });
  it("every line ≤60 chars under worst-case fills", () => {
    for (const p of CORPUS) for (const l of nonEmpty(p)) {
      expect(fillSlots(l.text, WORST_CASE).length, `${p.id}: "${l.text}"`).toBeLessThanOrEqual(60);
    }
  });
  it("voice only in dialogue (both voices present); size only in concrete", () => {
    for (const p of CORPUS) {
      const voices = new Set(nonEmpty(p).map((l) => l.voice).filter((v) => v !== undefined));
      if (p.form === "dialogue") expect([...voices].sort(), p.id).toEqual([1, 2]);
      else expect(voices.size, p.id).toBe(0);
      if (p.form !== "concrete") {
        expect(nonEmpty(p).every((l) => l.size === undefined || l.size === "normal"), p.id).toBe(true);
      }
    }
  });
  it("no line text (>12 chars) repeats corpus-wide", () => {
    const seen = new Map<string, string>();
    for (const p of CORPUS) for (const l of nonEmpty(p)) {
      const key = l.text.toLowerCase();
      if (key.length <= 12) continue;
      expect(seen.get(key), `"${l.text}" in ${p.id} and ${seen.get(key)}`).toBeUndefined();
      seen.set(key, p.id);
    }
  });
});

describe.each([...COVERED_KINDS])("corpus floors: %s", (kind) => {
  it("has ≥8 poems", () => expect(byKind(kind).length).toBeGreaterThanOrEqual(8));
  it("has ≥2 safe poems (slots ⊆ SAFE_SLOTS)", () => {
    const safe = byKind(kind).filter((p) => p.slots.every((s) => SAFE_SLOTS[kind].includes(s)));
    expect(safe.length).toBeGreaterThanOrEqual(2);
  });
  it("covers bands/forms deeply enough for the no-repeat selector", () => {
    if (BANDED.has(kind)) {
      for (const b of BANDS) {
        const pool = bandEligible(kind, b);
        expect(pool.length, `${kind}/${b}`).toBeGreaterThanOrEqual(3);
        expect(new Set(pool.map((p) => p.form)).size, `${kind}/${b} forms`).toBeGreaterThanOrEqual(3);
      }
    } else {
      expect(new Set(byKind(kind).map((p) => p.form)).size).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("corpus totals (all kinds covered)", () => {
  it.runIf(COVERED_KINDS.length === 16)("≥128 poems and every form used somewhere", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(128);
    expect(new Set(CORPUS.map((p) => p.form)).size).toBe(POEM_FORMS.length);
  });
});
```

- [ ] **Step 8: Run to verify pass.** `npx vitest run src/storytell/poems` → all pass. `npx tsc --noEmit` → 0 errors.
- [ ] **Step 9: Commit** `git add src/storytell/poems && git commit -m "feat: poem model, slot vocabulary, and form-diversity selector"`.

---

### Task 3: Corpus, part 1 — the eight run-shaped kinds

**Files:**
- Create: `src/storytell/poems/first-run.ts`, `last-run.ts`, `longest-run.ts`, `fastest-run.ts`, `hilliest-run.ts`, `earliest-run.ts`, `latest-run.ts`, `night-runs.ts`
- Modify: `src/storytell/poems/index.ts` (register the 8 modules in `CORPUS` and `COVERED_KINDS`)

**Interfaces:**
- Consumes: `PoemSpec`, `FORM_RULES`, `SAFE_SLOTS`, `WORST_CASE` from Task 2. Each module exports `const POEMS: readonly PoemSpec[]` (named export `POEMS` in every module; `index.ts` imports them with aliases and spreads into `CORPUS`).
- Produces: 8 covered kinds passing every lint floor.

**This is an authoring task — dispatch to the most capable model.** The lint suite from Task 2 is the deterministic gate; a poetry-quality review (spec compliance + "would Silverstein smile" judgment) is the second gate. Requirements per module:

- ≥8 poems (aim 9–10). Banded kinds must satisfy the per-band floor (≥3 eligible × ≥3 forms per band — `"any"` poems count toward every band); `first-run`/`last-run`/`earliest-run`/`latest-run` are any-only kinds (`band: "any"` on every poem, ≥4 distinct forms).
- Registers by band: `small` poems tease gently ("your longest run… the mailbox is very proud"), `medium` respect, `large` go full epic/mythic.
- Every poem is a complete piece with its own idea and a turn. No shared lines, no near-clones with a swapped noun. Slots only where the poem is written around the value.
- ≥2 safe poems per kind (slots ⊆ `SAFE_SLOTS[kind]`), so selection can never starve.

**Exemplars — this is the bar** (these two ship in their modules; count them toward floors):

```ts
// in longest-run.ts
{
  id: "longest-run/what-the-road-collected",
  kind: "longest-run",
  form: "list",
  band: "large",
  mood: "triumphant",
  slots: ["km"],
  lines: [
    { text: "Things the road collected on the day you wouldn't stop:" },
    { text: "one sunrise, slightly used;", indent: 1 },
    { text: "a dog's opinion, freely given;", indent: 1 },
    { text: "the neighborhood's whole supply of hills;", indent: 1 },
    { text: "four kinds of weather, three of them at once;", indent: 1 },
    { text: "and every single one of your excuses", indent: 1 },
    { text: "(it keeps them in a jar).", indent: 1 },
    { text: "" },
    { text: "Then it wrote {km} kilometers in the ledger," },
    { text: "and stamped it PAID IN FULL —" },
    { text: "the road does not do refunds." },
  ],
},

// in fastest-run.ts
{
  id: "fastest-run/shoes-took-off",
  kind: "fastest-run",
  form: "quip",
  band: "medium",
  mood: "absurd",
  slots: ["pace"],
  lines: [
    { text: "The shoes took off at {pace} flat." },
    { text: "You were, of course, inside them." },
    { text: "There's still no legal precedent" },
    { text: "for who should get the medal." },
  ],
},
```

- [ ] **Step 1: Run the gate before writing.** `npx vitest run src/storytell/poems/forms.test.ts` — passes (no kinds covered yet). This is your red/green harness: floors activate as you register kinds.
- [ ] **Step 2: Author the 8 modules.** Write each module's poems (exemplars above included verbatim). Read `SAFE_SLOTS`/`WORST_CASE` in `forms.ts` first — a `{name}` fill can be 29 chars; write lines with room.
- [ ] **Step 3: Register.** In `index.ts`:

```ts
import { POEMS as FIRST_RUN } from "./first-run";
import { POEMS as LAST_RUN } from "./last-run";
import { POEMS as LONGEST_RUN } from "./longest-run";
import { POEMS as FASTEST_RUN } from "./fastest-run";
import { POEMS as HILLIEST_RUN } from "./hilliest-run";
import { POEMS as EARLIEST_RUN } from "./earliest-run";
import { POEMS as LATEST_RUN } from "./latest-run";
import { POEMS as NIGHT_RUNS } from "./night-runs";

export const CORPUS: readonly PoemSpec[] = [
  ...FIRST_RUN, ...LAST_RUN, ...LONGEST_RUN, ...FASTEST_RUN,
  ...HILLIEST_RUN, ...EARLIEST_RUN, ...LATEST_RUN, ...NIGHT_RUNS,
];

export const COVERED_KINDS: readonly StoryEventType[] = [
  "first-run", "last-run", "longest-run", "fastest-run",
  "hilliest-run", "earliest-run", "latest-run", "night-runs",
];
```

- [ ] **Step 4: Verify.** `npx vitest run src/storytell/poems` → all floors green for the 8 kinds. `npx tsc --noEmit` → 0 errors.
- [ ] **Step 5: Commit** `git add src/storytell/poems && git commit -m "feat: poem corpus part 1 — the eight run-shaped kinds"`.

---

### Task 4: Corpus, part 2 — the eight pattern kinds

**Files:**
- Create: `src/storytell/poems/false-starts.ts`, `quiet.ts`, `streak.ts`, `journey.ts`, `month.ts`, `route-champion.ts`, `hill-beast.ts`, `ghost-elevation.ts`
- Modify: `src/storytell/poems/index.ts` (register; `COVERED_KINDS` reaches all 16)

**Interfaces:** identical contract to Task 3 (`export const POEMS: readonly PoemSpec[]` per module). Registering the 16th kind arms the `corpus totals` lint (≥128 poems, all 9 forms used somewhere).

**Authoring task — most capable model.** Same rules as Task 3, plus:

- `ghost-elevation` is any-only (`band: "any"` everywhere, ≥4 forms). All other 7 kinds here are banded.
- These kinds carry the book's emotional weight (`quiet` especially — it's the antagonist). At least one `quiet` poem must be genuinely tender under the joke.
- The five named kinds (`quiet`, `hill-beast`, `route-champion`, `night-runs`, `ghost-elevation`) should use `{name}` prominently in several poems — the generated names ("The Everlasting Quiet") are half the charm.

**Exemplar — this one ships in `quiet.ts`:**

```ts
{
  id: "quiet/letter-from-the-shoes",
  kind: "quiet",
  form: "letter",
  band: "large",
  mood: "quiet",
  slots: ["days", "name"],
  lines: [
    { text: "Dear Owner," },
    { text: "" },
    { text: "It has been {days} days. We are still by the door." },
    { text: "The laces have gone stiff from all the waiting." },
    { text: "A spider moved into the left one Tuesday." },
    { text: "We told her you'd be back. She laughed." },
    { text: "" },
    { text: "We are not angry. Shoes are built for patience." },
    { text: "But {name} waits with us out here," },
    { text: "and it is getting large." },
    { text: "" },
    { text: "Yours truly,", align: "right" },
    { text: "The Shoes", align: "right" },
  ],
},
```

- [ ] **Step 1: Author the 8 modules** (exemplar included verbatim in `quiet.ts`).
- [ ] **Step 2: Register all 8** in `index.ts` (same alias-import pattern as Task 3); `COVERED_KINDS` now lists all 16 kinds.
- [ ] **Step 3: Verify.** `npx vitest run src/storytell/poems` → every floor + the totals gate green. `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit** `git add src/storytell/poems && git commit -m "feat: poem corpus part 2 — the eight pattern kinds"`.

---

### Task 5: Wire poems into the Book; retire the couplet engine

**Files:**
- Modify: `src/storytell/types.ts` (Chapter), `src/storytell/book.ts` (buildBook), `src/storytell/index.ts` (exports), `src/render/pages.ts:146` (minimal adaptation), `src/storytell/book.test.ts` (+ snapshot regen)
- Delete: `src/storytell/verse.ts`, `src/storytell/fragments.ts`, `src/storytell/rhyme.ts`, `src/storytell/verse.test.ts`, `src/storytell/rhyme.test.ts`

**Interfaces:**
- Consumes: `PoemSelector`, `poemFor`, `CORPUS`, `ChapterPoem` from Tasks 2–4.
- Produces: `Chapter.poem: ChapterPoem` (field `verse` is GONE — Task 6 relies on `chapter.poem.form` and `chapter.poem.lines`). `src/storytell/index.ts` re-exports the `poems` package instead of `verseFor`.

- [ ] **Step 1: Flip the model test.** In `book.test.ts`, replace `verse` expectations with (adapting to the existing fixture names):

```ts
it("gives every chapter a poem with a form, and no form repeats", () => {
  const book = buildBook(year, story);
  const forms = book.chapters.map((c) => c.poem.form);
  expect(forms.length).toBeGreaterThan(0);
  // only 9 forms exist; a book with more chapters than forms must still use all 9 before repeating
  expect(new Set(forms).size).toBe(Math.min(forms.length, 9));
  for (const c of book.chapters) {
    expect(c.poem.lines.length).toBeGreaterThan(0);
    for (const l of c.poem.lines) expect(l.text).not.toContain("{");
  }
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/storytell/book.test.ts` — FAILS (no `poem` field).
- [ ] **Step 3: Change the model.** In `types.ts`: replace `verse: string[];` with `poem: ChapterPoem;` and add `import type { ChapterPoem } from "./poems/forms";`.
- [ ] **Step 4: Wire buildBook.** In `book.ts`: replace `import { verseFor } from "./verse";` with `import { PoemSelector, poemFor } from "./poems/select";` and `import { CORPUS } from "./poems";`. Before the chapter loop (after `const usedNames = new Set<string>();` at line 537) add `const poems = new PoemSelector(CORPUS);`. Replace line 547 with `const poem = poemFor(poems, event, { name, place: placeName }, rng);` and the chapter literal's `verse,` with `poem,`.
- [ ] **Step 5: Minimal render adaptation.** In `pages.ts:146` replace the `verseHtml` line with:

```ts
const verseHtml = chapter.poem.lines
  .map((l) => (l.text === "" ? `<div class="poem-gap"></div>` : `<div class="verse">${esc(l.text)}</div>`))
  .join("");
```

(Task 6 replaces this with full per-form rendering; this keeps the build green.)

- [ ] **Step 6: Delete the old engine.** `git rm src/storytell/verse.ts src/storytell/fragments.ts src/storytell/rhyme.ts src/storytell/verse.test.ts src/storytell/rhyme.test.ts`. Fix `src/storytell/index.ts`: remove old exports; add `export * from "./poems";`. Grep `verseFor\|fragments\|rhyme\|VerseContext` across `src/` — zero remaining references.
- [ ] **Step 7: Regenerate the golden.** `npx vitest run src/storytell/book.test.ts -u` then eyeball the snapshot diff: every chapter has a `poem` with plausible, distinct-form content; commit only if the poems read well.
- [ ] **Step 8: Full verification.** `npx tsc --noEmit` → 0. `npx vitest run` → all pass. `npx vite build` → success.
- [ ] **Step 9: Commit** `git add -A && git commit -m "feat!: chapters carry whole poems; couplet engine retired"`.

---

### Task 6: Per-form rendering and typography

**Files:**
- Modify: `src/render/pages.ts` (replace Step-5 minimal adaptation with `renderPoem`), `src/render/theme.css`
- Test: `src/render/pages.test.ts`

**Interfaces:**
- Consumes: `Chapter.poem` from Task 5; `esc` from `./svg`.
- Produces: `renderPoem(poem: ChapterPoem): string` (module-private); poem markup contract for Plans G/H: wrapper `<div class="poem poem-{form}">`, each line `<div class="verse poem-line …modifiers">`, gaps `<div class="poem-gap">`.

- [ ] **Step 1: Write the failing tests** (add to `pages.test.ts`; build small `Book` fixtures by cloning an existing chapter fixture and overriding `poem`):

```ts
it("renders poem form class and line modifiers", () => {
  const poem = { form: "dialogue" as const, lines: [
    { text: "Who goes there?", voice: 1 as const },
    { text: "Me. Again. Still.", voice: 2 as const },
    { text: "", },
    { text: "CLOSED", align: "center" as const, size: "large" as const },
    { text: "step two,", indent: 2 as const },
  ]};
  const html = renderBook({ ...book, chapters: [{ ...book.chapters[0]!, poem }] }, year);
  expect(html).toContain('class="poem poem-dialogue"');
  expect(html).toContain('class="verse poem-line voice-1"');
  expect(html).toContain('class="verse poem-line voice-2"');
  expect(html).toContain('<div class="poem-gap"></div>');
  expect(html).toContain("align-center");
  expect(html).toContain("size-large");
  expect(html).toContain("indent-2");
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/render/pages.test.ts` — FAILS.
- [ ] **Step 3: Implement `renderPoem`** in `pages.ts` (replacing the Task 5 inline mapping in `renderChapter` with `renderPoem(chapter.poem)`):

```ts
function renderPoem(poem: ChapterPoem): string {
  const lines = poem.lines
    .map((l) => {
      if (l.text === "") return `<div class="poem-gap"></div>`;
      const cls = ["verse", "poem-line"];
      if (l.voice !== undefined) cls.push(`voice-${l.voice}`);
      if (l.indent) cls.push(`indent-${l.indent}`);
      if (l.align !== undefined && l.align !== "left") cls.push(`align-${l.align}`);
      if (l.size !== undefined && l.size !== "normal") cls.push(`size-${l.size}`);
      return `<div class="${cls.join(" ")}">${esc(l.text)}</div>`;
    })
    .join("");
  return `<div class="poem poem-${poem.form}">${lines}</div>`;
}
```

Add `import type { ChapterPoem } from "../storytell";` (re-exported via `storytell/index.ts` in Task 5).

- [ ] **Step 4: Typography.** Append to `theme.css` (after the `.verse` rule at ~line 101; the handwriting stack matches the one used at lines 135/144/163):

```css
/* --- poem forms (Plan F) ------------------------------------------- */
.poem { margin: 0.4rem 0 1rem; }
.poem-gap { height: 0.8em; }
.poem-line.indent-1 { padding-left: 1.3em; }
.poem-line.indent-2 { padding-left: 2.6em; }
.poem-line.indent-3 { padding-left: 3.9em; }
.poem-line.align-center { text-align: center; }
.poem-line.align-right { text-align: right; }
.poem-concrete .size-large { font-size: 1.35em; line-height: 1.5; }
.poem-concrete .size-small { font-size: 0.82em; }
.poem-dialogue .voice-2 {
  font-family: "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive;
  color: var(--pencil);
  padding-left: 1.6em;
}
.poem-notice .poem-line {
  text-align: center;
  font-variant-caps: small-caps;
  letter-spacing: 0.07em;
}
.poem-letter .poem-line:first-child { font-style: italic; }
.poem-spell .poem-line { line-height: 2.05; }
```

- [ ] **Step 5: Verify + print.** `npx vitest run src/render` → pass. Open the print block (`theme.css:275` `@media print`) and confirm it doesn't hide or restyle `.verse` in a way that breaks the new classes (`.poem-gap` height and indents are plain layout — they inherit fine; add nothing unless something in the print block explicitly overrides `.verse` display). `npx tsc --noEmit` → 0. `npx vite build` → success.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: per-form poem rendering and typography"`.

---

## Final gates (controller-run, after Task 6)

1. Full suite + typecheck + build green on the branch.
2. Whole-branch review (most capable model) with special attention to poem quality — the reviewer reads the corpus as an editor, not a linter.
3. Browser acceptance (scratchpad playwright-core + system Chrome headless): demo book renders 14 chapters with ≥5 distinct `poem-*` form classes; no `page-game` anywhere; `#game` hash boots to cover without error; zero JS errors; zero external requests; print stylesheet spot-check; dark mode screenshot.
4. Real-export acceptance: build the user's export (`/Users/rohnach29/Downloads/apple_health_export 2/` — NEVER committed), read every chapter poem, confirm no form repeats and registers match magnitudes.
5. Merge to main + push only when all green.
```

## Self-Review (author's check against spec)

- Spec coverage: poem model ✅ (Task 2) · corpus + floors ✅ (Tasks 3–4, floors match spec §Plan F) · selection w/ form diversity + bands ✅ (Task 2) · integration + snapshot ✅ (Task 5) · per-form rendering + print ✅ (Task 6) · game removal ✅ (Task 1) · dedication/colophon unchanged ✅ (untouched).
- Placeholders: none — every code step carries complete code; authoring tasks carry complete exemplars + lint gates as their acceptance.
- Type consistency: `PoemSpec.kind` used by selector and lint; `POEMS` named export contract stated in both corpus tasks; `ChapterPoem` import path consistent (`./poems/forms` internally, re-export via `../storytell` for render).
