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
  it("never repeats a poem id while fresh candidates remain", () => {
    const s = new PoemSelector(FIX);
    const r = new Rng(7);
    const ids = [1, 2, 3, 4].map((t) => s.select(ev("longest-run", t, 10), {}, r.fork(`t${t}`)).spec.id);
    expect(new Set(ids).size).toBe(4);
  });
  it("allows repeats rather than throwing when the pool empties", () => {
    const s = new PoemSelector(FIX.slice(0, 2));
    const r = new Rng(7);
    const seen = [1, 2, 3].map((t) => s.select(ev("longest-run", t, 10), {}, r.fork(`t${t}`)).spec.id);
    expect(new Set(seen.slice(0, 2)).size).toBe(2);
    expect(seen.slice(0, 2)).toContain(seen[2]);
  });
  it("routes a small event away from large-band poems", () => {
    const s = new PoemSelector(FIX);
    const r = new Rng(7);
    for (let t = 1; t <= 4; t++) {
      expect(s.select(ev("longest-run", t, 5), {}, r.fork(`t${t}`)).spec.id).not.toBe("longest-run/epic");
    }
  });
  it("relaxes band before giving up, throws only with zero candidates", () => {
    const s = new PoemSelector([mk("longest-run", "only", "quip", "large")]);
    expect(s.select(ev("longest-run", 1, 5), {}, new Rng(1)).spec.id).toBe("longest-run/only");
    const empty = new PoemSelector([]);
    expect(() => empty.select(ev("longest-run", 1, 5), {}, new Rng(1))).toThrow(/no candidate/);
  });
  it("drops poems whose slots don't resolve (honesty)", () => {
    const s = new PoemSelector([mk("longest-run", "needy", "quip", "any", ["name"]), mk("longest-run", "safe", "list", "any")]);
    expect(s.select(ev("longest-run", 1, 10), {}, new Rng(1)).spec.id).toBe("longest-run/safe");
  });
});

describe("cast & callback codas", () => {
  const intro = (kind: string, slug: string, cast: PoemSpec["introduces"]): PoemSpec =>
    ({ ...mk(kind, slug, "quip", "any"), introduces: cast });
  const withCoda = (kind: string, slug: string, requires: "shadow" | "shoes"): PoemSpec =>
    ({ ...mk(kind, slug, "quip", "any"), coda: { requires, lines: [{ text: "P.S. the coda line." }] } });

  it("activates a coda only when its cast member arrived in an earlier chapter", () => {
    const s = new PoemSelector([intro("first-run", "meet-shadow", ["shadow"]), withCoda("last-run", "bye", "shadow")]);
    expect(s.select(ev("first-run", 1, 1), {}, new Rng(1)).codaActive).toBe(false);
    expect(s.select(ev("last-run", 2, 1), {}, new Rng(1)).codaActive).toBe(true);
  });
  it("never lets a poem satisfy its own coda", () => {
    const both: PoemSpec = { ...mk("first-run", "self", "quip", "any"), introduces: ["shadow"], coda: { requires: "shadow", lines: [{ text: "no." }] } };
    expect(new PoemSelector([both]).select(ev("first-run", 1, 1), {}, new Rng(1)).codaActive).toBe(false);
  });
  it("prefers the activatable-coda tier when one exists", () => {
    const s = new PoemSelector([
      intro("first-run", "meet-shadow", ["shadow"]),
      mk("last-run", "plain-a", "quip", "any"),
      mk("last-run", "plain-b", "list", "any"),
      withCoda("last-run", "callback", "shadow"),
    ]);
    s.select(ev("first-run", 1, 1), {}, new Rng(1));
    for (let seed = 1; seed <= 5; seed++) {
      const fresh = new PoemSelector([
        intro("first-run", "meet-shadow", ["shadow"]),
        mk("last-run", "plain-a", "quip", "any"),
        mk("last-run", "plain-b", "list", "any"),
        withCoda("last-run", "callback", "shadow"),
      ]);
      fresh.select(ev("first-run", 1, 1), {}, new Rng(seed));
      expect(fresh.select(ev("last-run", 2, 1), {}, new Rng(seed)).spec.id).toBe("last-run/callback");
    }
  });
  it("caps activated codas at 3 per book", () => {
    const corpus: PoemSpec[] = [
      intro("first-run", "meet-shoes", ["shoes"]),
      ...[1, 2, 3, 4].map((i) => withCoda("month", `m${i}`, "shoes")),
    ];
    const s = new PoemSelector(corpus);
    s.select(ev("first-run", 1, 1), {}, new Rng(1));
    const fired = [2, 3, 4, 5].map((t) => s.select(ev("month", t, 50), {}, new Rng(t)).codaActive);
    expect(fired.filter(Boolean).length).toBe(3);
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
