import { describe, expect, it } from "vitest";
import { CORPUS, COVERED_KINDS } from "./index";
import { FORM_RULES, POEM_FORMS, SAFE_SLOTS, WORST_CASE, type Band, type PoemLine, type PoemSpec } from "./forms";
import { isBranch } from "./realize";
import { fillSlots } from "./slots";

const SLOT_RE = /\{(\w+)\}/g;
const byKind = (k: string) => CORPUS.filter((p) => p.kind === k);

/** Every authored line set of a poem: plain lines, each branch default,
 *  each variant, and the coda — the lint surface for text rules. */
const allLines = (p: PoemSpec): PoemLine[] => {
  const lines: PoemLine[] = [];
  for (const u of p.lines) {
    if (isBranch(u)) {
      lines.push(...u.branch.default);
      for (const v of u.branch.variants) lines.push(...v.lines);
    } else lines.push(u);
  }
  if (p.coda) lines.push(...p.coda.lines);
  return lines;
};
const nonEmpty = (lines: readonly PoemLine[]) => lines.filter((l) => l.text !== "");

/** Realized non-empty line-count range across all branch options; coda
 *  counts toward the max (it may or may not fire). */
const lineCountRange = (p: PoemSpec): { min: number; max: number } => {
  let min = 0;
  let max = 0;
  for (const u of p.lines) {
    if (isBranch(u)) {
      const options = [u.branch.default, ...u.branch.variants.map((v) => v.lines)].map(
        (ls) => nonEmpty(ls).length,
      );
      min += Math.min(...options);
      max += Math.max(...options);
    } else if (u.text !== "") {
      min += 1;
      max += 1;
    }
  }
  if (p.coda) max += nonEmpty(p.coda.lines).length;
  return { min, max };
};

const tokensOf = (p: PoemSpec) =>
  new Set(nonEmpty(allLines(p)).flatMap((l) => [...l.text.matchAll(SLOT_RE)].map((m) => m[1]!)));
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
  it("line counts within FORM_RULES across all branch options", () => {
    for (const p of CORPUS) {
      const { min, max } = lineCountRange(p);
      const r = FORM_RULES[p.form];
      expect(min, `${p.id} (${p.form}) min`).toBeGreaterThanOrEqual(r.min);
      expect(max, `${p.id} (${p.form}) max`).toBeLessThanOrEqual(r.max);
    }
  });
  it("every line ≤60 chars under worst-case fills", () => {
    for (const p of CORPUS) for (const l of nonEmpty(allLines(p))) {
      expect(fillSlots(l.text, WORST_CASE).length, `${p.id}: "${l.text}"`).toBeLessThanOrEqual(60);
    }
  });
  it("branches are well-formed: non-empty defaults, variants, and conditions", () => {
    for (const p of CORPUS) for (const u of p.lines) {
      if (!isBranch(u)) continue;
      expect(nonEmpty(u.branch.default).length, `${p.id} branch default`).toBeGreaterThan(0);
      expect(u.branch.variants.length, `${p.id} branch variants`).toBeGreaterThan(0);
      for (const v of u.branch.variants) {
        expect(nonEmpty(v.lines).length, `${p.id} variant lines`).toBeGreaterThan(0);
        const keys = Object.entries(v.when).filter(([, vals]) => vals !== undefined);
        expect(keys.length, `${p.id} empty condition`).toBeGreaterThan(0);
        for (const [key, vals] of keys) {
          expect((vals as readonly string[]).length, `${p.id} when.${key} empty`).toBeGreaterThan(0);
        }
      }
    }
  });
  it("voice only in dialogue (both voices present); size only in concrete", () => {
    for (const p of CORPUS) {
      const lines = nonEmpty(allLines(p));
      const voices = new Set(lines.map((l) => l.voice).filter((v) => v !== undefined));
      if (p.form === "dialogue") expect([...voices].sort(), p.id).toEqual([1, 2]);
      else expect(voices.size, p.id).toBe(0);
      if (p.form !== "concrete") {
        expect(lines.every((l) => l.size === undefined || l.size === "normal"), p.id).toBe(true);
      }
    }
  });
  it("no line text (>12 chars) repeats corpus-wide", () => {
    const seen = new Map<string, string>();
    for (const p of CORPUS) for (const l of nonEmpty(allLines(p))) {
      const key = l.text.toLowerCase();
      if (key.length <= 12) continue;
      expect(seen.get(key), `"${l.text}" in ${p.id} and ${seen.get(key)}`).toBeUndefined();
      seen.set(key, p.id);
    }
  });
});

/** Kinds already rewritten to the Silverstein corpus (Rebirth v2). Batch
 *  membership grows as corpus batches land; Task 7 requires all 16. */
const MIGRATED = new Set<string>([
  "first-run", "longest-run", "fastest-run", "last-run",
  "quiet", "streak", "false-starts", "month",
]);
/** Per-kind selection caps from book.ts — a book can hold this many chapters
 *  of the kind, so this many always-eligible poems must exist. */
const REPEAT_CAPS: Record<string, number> = { quiet: 3, month: 3, streak: 2, journey: 2 };

describe.each([...COVERED_KINDS].filter((k) => MIGRATED.has(k)))("corpus floors (v2): %s", (kind) => {
  it("has ≥6 poems", () => expect(byKind(kind).length).toBeGreaterThanOrEqual(6));
  it("has enough always-eligible poems (band any + safe slots)", () => {
    const floor = Math.max(2, REPEAT_CAPS[kind] ?? 1);
    const safe = byKind(kind).filter(
      (p) => p.band === "any" && p.slots.every((s) => SAFE_SLOTS[kind].includes(s)),
    );
    expect(safe.length).toBeGreaterThanOrEqual(floor);
  });
  it.runIf(BANDED.has(kind))("has ≥3 candidates in every band", () => {
    for (const b of BANDS) {
      expect(bandEligible(kind, b).length, `${kind}/${b}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.each([...COVERED_KINDS].filter((k) => !MIGRATED.has(k)))("corpus floors (v1): %s", (kind) => {
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

describe("corpus totals (all kinds migrated)", () => {
  it.runIf(COVERED_KINDS.every((k) => MIGRATED.has(k)))("≥96 poems, only v2 forms, every coda reachable", () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(96);
    const forms = new Set<string>(CORPUS.map((p) => p.form));
    expect([...forms].sort()).toEqual(["concrete", "list", "verse"].filter((f) => forms.has(f)));
    const introduced = new Map<string, Set<string>>();
    for (const p of CORPUS) for (const c of p.introduces ?? []) {
      if (!introduced.has(c)) introduced.set(c, new Set());
      introduced.get(c)!.add(p.kind);
    }
    for (const p of CORPUS) {
      if (!p.coda) continue;
      const kinds = introduced.get(p.coda.requires) ?? new Set();
      const others = [...kinds].filter((k) => k !== p.kind);
      expect(others.length, `${p.id} coda requires ${p.coda.requires}`).toBeGreaterThan(0);
    }
  });
});
