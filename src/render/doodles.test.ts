import { describe, it, expect } from "vitest";
import { doodleFor, DOODLE_TAGS } from "./doodles";
import { makeSyntheticYear } from "../fixtures/synthetic";
import { analyzeYear } from "../analyze";
import { buildBook } from "../storytell";

function countElements(svg: string): number {
  const matches = svg.match(/<(path|circle|line|ellipse)\b/g);
  return matches ? matches.length : 0;
}

describe("DOODLE_TAGS", () => {
  it("has exactly the 13 tags book.ts can emit", () => {
    expect(DOODLE_TAGS).toEqual([
      "shoes",
      "empty-shoes",
      "moon",
      "stars",
      "plane",
      "globe",
      "hills",
      "calendar",
      "banana",
      "ghost",
      "trophy",
      "chain",
      "wind",
    ]);
  });
});

describe("doodleFor", () => {
  for (const tag of DOODLE_TAGS) {
    it(`returns a well-formed doodle for "${tag}"`, () => {
      const svg = doodleFor(tag);
      expect(svg).not.toBe("");
      expect(svg).toContain('class="ink-doodle"');
      expect(svg).toContain('viewBox="0 0 120 120"');
      expect(svg).toContain('filter="url(#wobble)"');
      expect(svg).not.toContain("<text");

      const count = countElements(svg);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(8);
    });
  }

  it("returns empty string for an unknown tag", () => {
    expect(doodleFor("not-a-real-tag")).toBe("");
    expect(doodleFor("")).toBe("");
  });

  it("is deterministic (static strings, called twice → identical)", () => {
    for (const tag of DOODLE_TAGS) {
      expect(doodleFor(tag)).toBe(doodleFor(tag));
    }
  });
});

describe("doodleFor cross-check against a real fixture book", () => {
  const year = makeSyntheticYear();
  const story = analyzeYear(year);
  const book = buildBook(year, story);

  it("gives a non-empty doodle for every chapter's doodleTags", () => {
    expect(book.chapters.length).toBeGreaterThan(0);
    for (const chapter of book.chapters) {
      for (const tag of chapter.doodleTags) {
        expect(doodleFor(tag)).not.toBe("");
      }
    }
  });

  it("gives a non-empty doodle for every beast's doodleTag", () => {
    for (const beast of book.beasts) {
      expect(doodleFor(beast.doodleTag)).not.toBe("");
    }
  });
});
