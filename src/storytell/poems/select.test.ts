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
