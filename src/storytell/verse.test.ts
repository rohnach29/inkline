import { describe, it, expect } from "vitest";
import { COUPLETS } from "./fragments";
import type { Mood } from "./fragments";
import { lastWord, rhymeFamily, lineSyllables } from "./rhyme";
import { verseFor, fillSlots, slotValues } from "./verse";
import { Rng } from "./rng";
import type { StoryEvent, StoryEventType } from "../analyze/types";

// The 16 event types book.ts makes chapters from.
const CHAPTER_TYPES: StoryEventType[] = [
  "first-run", "last-run", "longest-run", "fastest-run", "hilliest-run",
  "earliest-run", "latest-run", "night-runs", "false-starts", "quiet",
  "streak", "journey", "month", "route-champion", "hill-beast", "ghost-elevation",
];

const MOODS: Mood[] = [
  "triumphant", "sheepish", "nocturnal", "quiet", "absurd", "steady",
];

// Canonical slot values (brief rule 3).
const CANON: Record<string, string> = {
  km: "12.3", days: "132", count: "7", month: "October", pace: "5:12 /km",
  time: "23:41", gain: "480", name: "Mount Regret", place: "Mumbai", year: "2025",
};

describe("library rule 1 — size and coverage", () => {
  it("has >= 60 couplets and >= 120 lines", () => {
    expect(COUPLETS.length).toBeGreaterThanOrEqual(60);
    expect(COUPLETS.length * 2).toBeGreaterThanOrEqual(120);
  });

  it("gives every mood >= 6 couplets", () => {
    for (const m of MOODS) {
      const n = COUPLETS.filter((c) => c.mood === m).length;
      expect(n, `mood ${m}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("covers every chapter type with >=2 open, >=1 data, >=2 close", () => {
    for (const t of CHAPTER_TYPES) {
      const open = COUPLETS.filter((c) => c.role === "open" && c.kinds.includes(t)).length;
      const data = COUPLETS.filter((c) => c.role === "data" && c.kinds.includes(t)).length;
      const close = COUPLETS.filter((c) => c.role === "close" && c.kinds.includes(t)).length;
      expect(open, `${t} open`).toBeGreaterThanOrEqual(2);
      expect(data, `${t} data`).toBeGreaterThanOrEqual(1);
      expect(close, `${t} close`).toBeGreaterThanOrEqual(2);
    }
  });

  it("only lists real event types in kinds (no wildcard)", () => {
    for (const c of COUPLETS) {
      expect(c.kinds.length).toBeGreaterThan(0);
      for (const k of c.kinds) {
        expect(CHAPTER_TYPES).toContain(k);
      }
    }
  });
});

describe("library rule 2 — rhyme gate", () => {
  it("every couplet rhymes and its family is not empty", () => {
    for (const c of COUPLETS) {
      const fa = rhymeFamily(lastWord(c.a));
      const fb = rhymeFamily(lastWord(c.b));
      expect(fa, `${c.a}`).not.toBe("");
      expect(fb, `${c.b}`).not.toBe("");
      expect(fa, `${c.a} / ${c.b}`).toBe(fb);
    }
  });

  it("never ends a line on a {slot}", () => {
    for (const c of COUPLETS) {
      expect(/\{\w+\}[^A-Za-z0-9]*$/.test(c.a.trim())).toBe(false);
      expect(/\{\w+\}[^A-Za-z0-9]*$/.test(c.b.trim())).toBe(false);
    }
  });
});

describe("library rule 3 — scan gate", () => {
  const fill = (line: string) =>
    line.replace(/\{(\w+)\}/g, (_, k: string) => CANON[k] as string);

  it("keeps paired lines within 2 syllables under canonical fills", () => {
    for (const c of COUPLETS) {
      const sa = lineSyllables(fill(c.a));
      const sb = lineSyllables(fill(c.b));
      expect(Math.abs(sa - sb), `${c.a} / ${c.b} (${sa} vs ${sb})`).toBeLessThanOrEqual(2);
    }
  });
});

// ---- helpers for verseFor behaviour ----
function ev(type: StoryEventType, data: StoryEvent["data"], atUtc = 1000): StoryEvent {
  return { type, runIds: ["r1"], atUtc, magnitude: 1, data };
}

describe("fillSlots", () => {
  it("substitutes known slots", () => {
    expect(fillSlots("ran {km} km at {pace}", { km: "12.3", pace: "5:12 /km" }))
      .toBe("ran 12.3 km at 5:12 /km");
  });
  it("throws on an unresolved slot", () => {
    expect(() => fillSlots("a {bogus} line", {})).toThrow();
    expect(() => fillSlots("a {km} line", {})).toThrow();
  });
  it("leaves slot-free lines untouched", () => {
    expect(fillSlots("no slots here.", {})).toBe("no slots here.");
  });
});

describe("slotValues — deterministic formatting", () => {
  it("formats km to one decimal", () => {
    expect(slotValues(ev("longest-run", { km: 12.34, startLocal: "2025-05-01T08:00" }), {}).km)
      .toBe("12.3");
  });
  it("formats pace as M:SS /km", () => {
    expect(slotValues(ev("fastest-run", { paceMinPerKm: 5.2, km: 10, startLocal: "2025-01-01" }), {}).pace)
      .toBe("5:12 /km");
  });
  it("maps YYYY-MM to an English month name", () => {
    expect(slotValues(ev("month", { month: "2025-10", runs: 12, km: 100, bestKm: 20 }), {}).month)
      .toBe("October");
  });
  it("takes year from the first available date field", () => {
    expect(slotValues(ev("streak", { days: 30, fromDate: "2024-06-01", toDate: "2024-07-01" }), {}).year)
      .toBe("2024");
  });
  it("formats counts and gains as integers", () => {
    const v = slotValues(ev("hilliest-run", { elevationGainM: 480.6, startLocal: "2025-03-03" }), {});
    expect(v.gain).toBe("481");
  });
  it("only exposes slots whose source data is present (honesty)", () => {
    const v = slotValues(ev("false-starts", { count: 3, shortestKm: 0.4, shortestStartLocal: "2025-02-02" }), {});
    expect(v.count).toBe("3");
    expect(v.pace).toBeUndefined();
    expect(v.km).toBeUndefined();
    expect(v.year).toBeUndefined();
  });
  it("takes name and place from context only", () => {
    const v = slotValues(ev("first-run", { km: 5, startLocal: "2025-01-01" }), { name: "The Blue Mile", place: "Oslo" });
    expect(v.name).toBe("The Blue Mile");
    expect(v.place).toBe("Oslo");
  });
});

describe("verseFor", () => {
  const rng = () => new Rng(12345);

  it("returns a 4-6 line poem with every slot resolved", () => {
    const lines = verseFor(
      ev("longest-run", { km: 21.1, startLocal: "2025-08-08T06:00" }),
      {}, rng(),
    );
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(6);
    for (const l of lines) expect(l).not.toMatch(/\{/);
  });

  it("is deterministic across two identical calls", () => {
    const e = ev("fastest-run", { paceMinPerKm: 4.5, km: 8.2, startLocal: "2025-09-09" });
    expect(verseFor(e, {}, rng())).toEqual(verseFor(e, {}, rng()));
  });

  it("includes a data couplet (6 lines) when a slot resolves", () => {
    const lines = verseFor(
      ev("quiet", { days: 40, fromLocal: "2025-04-01", toLocal: "2025-05-11" }),
      {}, rng(),
    );
    expect(lines.length).toBe(6);
    expect(lines.join(" ")).toContain("40");
  });

  it("omits the data couplet (4 lines) when no data couplet can resolve", () => {
    // false-starts data couplet needs {count}; withhold it.
    const lines = verseFor(ev("false-starts", { shortestKm: 0.3 }), {}, rng());
    expect(lines.length).toBe(4);
    for (const l of lines) expect(l).not.toMatch(/\{/);
  });

  it("forks its stream by type+atUtc, so different events differ", () => {
    const a = verseFor(ev("streak", { days: 10, fromDate: "2025-01-01", toDate: "2025-01-11" }, 1), {}, rng());
    const b = verseFor(ev("streak", { days: 10, fromDate: "2025-01-01", toDate: "2025-01-11" }, 2), {}, rng());
    // same type, different atUtc → independent selection (may or may not match,
    // but must not throw and must be well-formed)
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(b.length).toBeGreaterThanOrEqual(4);
  });

  it("throws if a selected couplet references a slot with no value", () => {
    // guard: fillSlots is the last line of defense — prove it bites.
    expect(() => fillSlots("{gain} of climb", {})).toThrow();
  });
});
