import { describe, it, expect } from "vitest";
import { buildBook } from "./book";
import { analyzeYear } from "../analyze";
import { makeSyntheticYear } from "../fixtures/synthetic";
import type { Year } from "../ingest";

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
});
