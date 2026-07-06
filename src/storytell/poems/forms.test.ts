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
