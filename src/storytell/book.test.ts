import { describe, it, expect } from "vitest";
import { buildBook, selectEvents, dedupName } from "./book";
import { Rng, seedFromYear } from "./rng";
import { analyzeYear } from "../analyze";
import { makeSyntheticYear } from "../fixtures/synthetic";
import type { Year } from "../ingest";
import type { StoryEvent } from "../analyze/types";

const year = makeSyntheticYear();
const story = analyzeYear(year);
const FIXTURE_TOTAL_KM = 88.0; // hand-summed from src/fixtures/synthetic.ts run list

function emptyYear(): Year {
  return { runs: [], places: [], span: { firstUtc: 0, lastUtc: 0 } };
}

function tinyYear(): Year {
  const y = makeSyntheticYear();
  return { runs: y.runs.slice(0, 2), places: y.places, span: { firstUtc: y.runs[0]!.startUtc, lastUtc: y.runs[1]!.startUtc } };
}

/** Year with a single run and a place that resolves to no known city. */
function midPacificYear(): Year {
  const y = makeSyntheticYear();
  const run = y.runs[0]!;
  return {
    runs: [run],
    places: [{ id: "far-place", lat: 0, lon: -160, runCount: 1 }],
    span: { firstUtc: run.startUtc, lastUtc: run.startUtc },
  };
}

describe("buildBook", () => {
  it("selects between 8 and 14 chapters", () => {
    const book = buildBook(year, story);
    expect(book.chapters.length).toBeGreaterThanOrEqual(8);
    expect(book.chapters.length).toBeLessThanOrEqual(14);
  });

  it("opens with the first-run event", () => {
    const book = buildBook(year, story);
    expect(book.chapters[0]?.eventType).toBe("first-run");
  });

  it("orders chapters strictly by atUtc", () => {
    const book = buildBook(year, story);
    for (let i = 1; i < book.chapters.length; i++) {
      expect(book.chapters[i]!.id).not.toBe(book.chapters[i - 1]!.id);
      const prevAt = Number(book.chapters[i - 1]!.id.split(":").pop());
      const curAt = Number(book.chapters[i]!.id.split(":").pop());
      expect(curAt).toBeGreaterThanOrEqual(prevAt);
    }
  });

  it("includes a journey chapter with a flight mapSpec and km > 500", () => {
    const book = buildBook(year, story);
    const journey = book.chapters.find((c) => c.eventType === "journey");
    expect(journey).toBeDefined();
    expect(journey!.mapSpec).not.toBeNull();
    expect(journey!.mapSpec!.kind).toBe("flight");
    if (journey!.mapSpec!.kind === "flight") {
      expect(journey!.mapSpec!.km).toBeGreaterThan(500);
    }
  });

  it("includes a quiet chapter whose title contains 'Quiet'", () => {
    const book = buildBook(year, story);
    const quiet = book.chapters.find((c) => c.eventType === "quiet");
    expect(quiet).toBeDefined();
    expect(quiet!.title).toContain("Quiet");
  });

  it("gives every chapter a 4-6 line verse with no unresolved slots", () => {
    const book = buildBook(year, story);
    for (const chapter of book.chapters) {
      expect(chapter.verse.length).toBeGreaterThanOrEqual(4);
      expect(chapter.verse.length).toBeLessThanOrEqual(6);
      for (const line of chapter.verse) {
        expect(line).not.toContain("{");
      }
    }
  });

  it("gives every stat value a digit (honesty smoke test)", () => {
    const book = buildBook(year, story);
    for (const chapter of book.chapters) {
      for (const stat of chapter.stats) {
        expect(stat.value).toMatch(/\d/);
      }
    }
  });

  it("lets type weight strictly dominate: false-starts in, month out", () => {
    // The fixture yields 14 events of distinct types with weight >= 25 plus
    // 6 month events (weight 10). Under strict weight dominance the months
    // can never displace a higher-weight type, so the 14 slots are exactly
    // the 14 higher-weight types — false-starts (weight 30) included.
    const book = buildBook(year, story);
    expect(book.chapters.some((c) => c.eventType === "false-starts")).toBe(true);
    expect(book.chapters.some((c) => c.eventType === "month")).toBe(false);
  });

  it("produces beasts, including a quiet beast", () => {
    const book = buildBook(year, story);
    expect(book.beasts.length).toBeGreaterThan(0);
    expect(book.beasts.some((b) => b.kind === "quiet")).toBe(true);
  });

  it("computes colophon.totalKm as the hand-summed fixture total", () => {
    const book = buildBook(year, story);
    expect(book.colophon.totalKm).toBeCloseTo(FIXTURE_TOTAL_KM, 1);
  });

  it("is deterministic across repeated calls", () => {
    const a = buildBook(year, story);
    const b = buildBook(year, story);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("matches the golden snapshot", () => {
    const book = buildBook(year, story);
    expect(book).toMatchSnapshot();
  });

  it("never throws on an empty year and produces 0 chapters", () => {
    const y = emptyYear();
    const s = analyzeYear(y);
    expect(() => buildBook(y, s)).not.toThrow();
    const book = buildBook(y, s);
    expect(book.chapters.length).toBe(0);
    expect(book.dedication).toEqual(["for the year that almost ran"]);
    expect(book.colophon.runCount).toBe(0);
    expect(book.colophon.gpsRunCount).toBe(0);
    expect(book.colophon.totalKm).toBe(0);
  });

  it("uses the short-book subtitle for a 2-run year", () => {
    const y = tinyYear();
    const s = analyzeYear(y);
    const book = buildBook(y, s);
    expect(book.subtitle).toBe("a very short book of running");
  });

  it("falls back to a placeless dedication when no place resolves to a named city", () => {
    const y = midPacificYear();
    const s = analyzeYear(y);
    const book = buildBook(y, s);
    expect(book.colophon.places).toEqual([]);
    expect(book.dedication).toEqual([
      "for the roads that got you nowhere in particular",
      `and the ${y.runs.length} runs that drew them`,
    ]);
  });

  it("omits the 'when' stat for a journey chapter whose evidence run can't be resolved", () => {
    const journeyEvent: StoryEvent = {
      type: "journey",
      runIds: [],
      atUtc: 1_000_000,
      magnitude: 600,
      data: { km: 600, fromCity: "Nowhere", toCity: "Somewhere Else", fromLat: 0, fromLon: 0, toLat: 1, toLon: 1 },
    };
    const y = tinyYear();
    const book = buildBook(y, { events: [journeyEvent] });
    const journey = book.chapters.find((c) => c.eventType === "journey");
    expect(journey).toBeDefined();
    expect(journey!.stats.some((s) => s.label === "when")).toBe(false);
    expect(journey!.stats.some((s) => s.label === "distance")).toBe(true);
  });

  it("breaks equal-weight ties across DIFFERENT types by atUtc, not magnitude", () => {
    // Regression test: earliest-run and latest-run share TYPE_WEIGHT (25).
    // latest-run's magnitude (seconds-of-day, max) is structurally >= an
    // earliest-run's magnitude (seconds-of-day, min), so a buggy comparator
    // that compares magnitude across types would always let latest-run win
    // a forced choice. Magnitude must only break ties WITHIN the same type;
    // across types the tie falls through to atUtc (then type) ordering.
    // false-starts (weight 30 > 25) has no per-type selection cap, so all
    // 13 fillers survive to the global 14-slot cut.
    const filler: StoryEvent[] = Array.from({ length: 13 }, (_, i) => ({
      type: "false-starts",
      runIds: [],
      atUtc: 1000 + i,
      magnitude: i,
      data: {},
    }));

    const earliestEvt: StoryEvent = {
      type: "earliest-run",
      runIds: [],
      atUtc: 500_000, // earlier atUtc
      magnitude: 6 * 3600, // 06:00 — small seconds-of-day
      data: {},
    };
    const latestEvt: StoryEvent = {
      type: "latest-run",
      runIds: [],
      atUtc: 600_000, // later atUtc
      magnitude: 20 * 3600, // 20:00 — large seconds-of-day
      data: {},
    };

    // 13 higher-weight filler events force exactly one of the two weight-25
    // tie candidates out of the top-14 selection.
    const selected = selectEvents([...filler, earliestEvt, latestEvt]);

    expect(selected.some((e) => e.type === "earliest-run")).toBe(true);
    expect(selected.some((e) => e.type === "latest-run")).toBe(false);
  });

  it("caps journeys at 2, keeping the 2 largest by km", () => {
    const journeys: StoryEvent[] = [600, 100, 400, 300, 500, 200].map((km, i) => ({
      type: "journey",
      runIds: [],
      atUtc: 1000 + i,
      magnitude: km,
      data: { km },
    }));
    const selected = selectEvents(journeys);
    const kms = selected.filter((e) => e.type === "journey").map((e) => e.magnitude).sort((a, b) => b - a);
    expect(kms).toEqual([600, 500]);
    expect(selected.length).toBe(2);
  });

  it("caps quiets at 3, keeping the 3 largest by days", () => {
    const quiets: StoryEvent[] = [12, 90, 5, 40, 7, 33, 60].map((days, i) => ({
      type: "quiet",
      runIds: [],
      atUtc: 1000 + i,
      magnitude: days,
      data: { days },
    }));
    const selected = selectEvents(quiets);
    const dayCounts = selected.filter((e) => e.type === "quiet").map((e) => e.magnitude).sort((a, b) => b - a);
    expect(dayCounts).toEqual([90, 60, 40]);
    expect(selected.length).toBe(3);
  });

  it("keeps longest-run even when journeys and quiets flood the pool (real-export regression)", () => {
    // Real data produced 6 journeys (w80) + 7 quiets (w70) = 13 events that,
    // uncapped, took every non-forced slot and pushed longest-run (w65) out.
    const journeys: StoryEvent[] = Array.from({ length: 6 }, (_, i) => ({
      type: "journey",
      runIds: [],
      atUtc: 10_000 + i,
      magnitude: 1000 + i,
      data: {},
    }));
    const quiets: StoryEvent[] = Array.from({ length: 7 }, (_, i) => ({
      type: "quiet",
      runIds: [],
      atUtc: 20_000 + i,
      magnitude: 10 + i,
      data: {},
    }));
    const bookends: StoryEvent[] = [
      { type: "first-run", runIds: [], atUtc: 1, magnitude: 5, data: {} },
      { type: "last-run", runIds: [], atUtc: 99_999, magnitude: 5, data: {} },
    ];
    const longest: StoryEvent = { type: "longest-run", runIds: [], atUtc: 15_000, magnitude: 21.1, data: {} };

    const selected = selectEvents([...journeys, ...quiets, ...bookends, longest]);

    expect(selected.some((e) => e.type === "longest-run")).toBe(true);
    expect(selected.filter((e) => e.type === "journey").length).toBe(2);
    expect(selected.filter((e) => e.type === "quiet").length).toBe(3);
  });

  it("dedupName redraws deterministically on collision", () => {
    const gen = (k: string) => (k === "base" ? "The Small Quiet" : `Drawn:${k}`);
    const draw = () => {
      const used = new Set<string>(["The Small Quiet"]);
      return dedupName(used, gen, "base");
    };
    const a = draw();
    const b = draw();
    expect(a).toBe(b); // deterministic across runs
    expect(a).toBe("Drawn:base#2"); // redraw with suffixed key, not the collision
  });

  it("dedupName falls back to '(Again)' when every redraw collides, and records the winner", () => {
    const used = new Set<string>(["The Small Quiet"]);
    const name = dedupName(used, () => "The Small Quiet", "k");
    expect(name).toBe("The Small Quiet (Again)");
    expect(used.has("The Small Quiet (Again)")).toBe(true);
  });

  it("never emits duplicate titles across chapters, nor duplicate beast names", () => {
    const book = buildBook(year, story);
    // ALL chapter titles unique — fixed-bank titles are de-duplicated too,
    // not just named-entity titles.
    const titles = book.chapters.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
    const beastKeys = book.beasts.map((b) => `${b.name}::${b.kind}`);
    expect(new Set(beastKeys).size).toBe(beastKeys.length);
    // beasts inherit their chapter's (de-duplicated) title
    for (const beast of book.beasts) {
      expect(book.chapters.some((c) => c.title === beast.name)).toBe(true);
    }
  });

  it("de-duplicates fixed-bank titles when two same-type chapters collide", () => {
    // Pinned collision: under tinyYear()'s seed (638724748), journey events
    // at atUtc 1002 and 1003 both first-draw "The Long Way Somewhere Else"
    // from the 3-entry journey bank (probed over atUtc 1000..1015). Pre-fix,
    // both chapters carried that identical title; post-fix the second is
    // redrawn with a suffixed fork key. The guard below re-derives both
    // first draws so the test fails loudly (rather than passing vacuously)
    // if the seed, bank contents, or fork-key scheme ever shift.
    const A = 1002;
    const B = 1003;
    const y = tinyYear();
    const mkJourney = (atUtc: number): StoryEvent => ({
      type: "journey",
      runIds: [],
      atUtc,
      magnitude: 600,
      data: { km: 600, fromCity: "Here", toCity: "There", fromLat: 0, fromLon: 0, toLat: 1, toLon: 1 },
    });

    const book = buildBook(y, { events: [mkJourney(A), mkJourney(B)] });
    const titles = book.chapters.filter((c) => c.eventType === "journey").map((c) => c.title);
    expect(titles.length).toBe(2); // both under the journey cap of 2

    // Guard: the underlying FIRST draws really do collide.
    const JOURNEY_BANK = ["The Long Way Somewhere Else", "A Very Large Commute", "Halfway Around, Give or Take"]; // mirror of TITLE_BANKS.journey
    const seedRng = new Rng(seedFromYear(y));
    const firstDraw = (atUtc: number) => seedRng.fork(`title:journey:${atUtc}`).pick(JOURNEY_BANK);
    expect(firstDraw(A)).toBe(firstDraw(B));

    // First chapter keeps the historical first-draw title; second differs.
    expect(titles[0]).toBe(firstDraw(A));
    expect(titles[1]).not.toBe(titles[0]);

    // Deterministic: an identical rebuild yields the identical pair.
    const again = buildBook(y, { events: [mkJourney(A), mkJourney(B)] });
    expect(again.chapters.filter((c) => c.eventType === "journey").map((c) => c.title)).toEqual(titles);
  });
});
