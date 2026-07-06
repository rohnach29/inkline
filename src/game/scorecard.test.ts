import { describe, it, expect } from "vitest";
import { Rng } from "../storytell/rng";
import { CARD_LINES, cardLine, scoreCardSvg, wrapPoemLine, type ScoreFacts } from "./scorecard";

describe("cardLine", () => {
  it("is deterministic for the same rounded distance", () => {
    const a = cardLine(new Rng(1), 4.27);
    const b = cardLine(new Rng(1), 4.27);
    expect(a).toBe(b);
  });

  it("returns a non-empty line for 20 different distances", () => {
    for (let i = 0; i < 20; i++) {
      const km = i * 0.37 + 0.1;
      const line = cardLine(new Rng(i + 1), km);
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe("scoreCardSvg", () => {
  const facts: ScoreFacts = {
    kmSurvived: 3.456,
    realKm: 812.789,
    beastHits: 2,
    furthestBeast: "Fear & Doubt",
  };
  const line = "You outran it for a while. That counts. It always counted.";
  const svg = scoreCardSvg(facts, line);

  it("starts with <svg", () => {
    expect(svg.startsWith("<svg")).toBe(true);
  });

  it("contains both stat lines with exact toFixed(1) values", () => {
    expect(svg).toContain("you outran The Quiet for 3.5 km");
    expect(svg).toContain("real-you ran 812.8 km that year");
  });

  it("esc()'s a furthestBeast name containing &", () => {
    expect(svg).toContain("Fear &amp; Doubt");
    expect(svg).not.toContain("Fear & Doubt");
  });

  it("declares the wobble-card filter id exactly once", () => {
    // Anchor on the id ATTRIBUTE (established pattern: pages.test.ts,
    // share.test.ts) so url(#wobble-card) references don't count as defs.
    const matches = svg.match(/id="wobble-card"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("applies the wobble-card filter to the border", () => {
    expect(svg).toContain('filter="url(#wobble-card)"');
  });

  it("has no leftover un-interpolated template placeholders", () => {
    // The inline <style> block legitimately contains CSS "{" / "}" braces,
    // so this checks for unsubstituted `${...}` template syntax rather than
    // any brace character.
    expect(svg).not.toContain("${");
  });

  it("includes exactly one inline <style> block with the card's typography", () => {
    const matches = svg.match(/<style>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(svg).toContain('"Bradley Hand","Segoe Print","Comic Sans MS",cursive');
    expect(svg).toContain('"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif');
    expect(svg).toContain(".ink-card-title{");
    expect(svg).toContain(".ink-card-stat{");
    expect(svg).toContain(".ink-card-poem{");
  });

  it("includes the poem line across its wrapped segments", () => {
    // The fixture line is 59 chars, so it wraps onto two rows; every wrapped
    // segment must appear, and re-joining them recovers the full line.
    const segments = wrapPoemLine(line);
    for (const segment of segments) {
      expect(svg).toContain(segment);
    }
    expect(segments.join(" ")).toBe(line);
  });

  it("includes the title", () => {
    expect(svg).toContain("OUTRUN THE QUIET");
  });

  it("handles a null furthestBeast without crashing or leaving artifacts", () => {
    const noBeast: ScoreFacts = { ...facts, furthestBeast: null };
    const out = scoreCardSvg(noBeast, line);
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).not.toContain("${");
  });

  it("wraps the longest bank line onto exactly two poem <text> rows", () => {
    const longest = CARD_LINES.reduce((a, b) => (b.length > a.length ? b : a));
    const out = scoreCardSvg(facts, longest);
    const poemTexts = out.match(/class="ink-card-poem"/g) ?? [];
    expect(poemTexts).toHaveLength(2);
    const segments = wrapPoemLine(longest);
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(out).toContain(segment);
    }
  });

  it("keeps a short poem line on a single <text> row at the original baseline", () => {
    const short = "The road remembers.";
    const out = scoreCardSvg(facts, short);
    const poemTexts = out.match(/class="ink-card-poem"/g) ?? [];
    expect(poemTexts).toHaveLength(1);
    expect(out).toContain(`y="220" text-anchor="middle" class="ink-card-poem"`);
  });
});

describe("wrapPoemLine", () => {
  it("keeps every bank line's segments narrow enough for the card border", () => {
    // 55 chars is the wrap threshold; a balanced mid-split of the longest
    // bank line (104 chars) yields halves of at most 55 — nothing in the
    // bank may produce a wider row (~7.5px/char at 17px italic serif keeps
    // 55 chars within the x [30, 450] safe area on the 480-wide card).
    for (const bankLine of CARD_LINES) {
      const segments = wrapPoemLine(bankLine);
      expect(segments.length).toBeLessThanOrEqual(2);
      for (const segment of segments) {
        expect(segment.length).toBeLessThanOrEqual(55);
      }
      expect(segments.join(" ")).toBe(bankLine);
    }
  });

  it("returns short lines unchanged as a single segment", () => {
    expect(wrapPoemLine("Short and true.")).toEqual(["Short and true."]);
  });

  it("splits long lines at the space nearest the midpoint", () => {
    const line = "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll";
    // Default "" keeps the destructuring type-safe under
    // noUncheckedIndexedAccess; the length assertions below fail loudly if
    // the wrap did not actually produce two segments.
    const [first, second = ""] = wrapPoemLine(line);
    expect(first.length).toBeGreaterThan(20);
    expect(second.length).toBeGreaterThan(20);
    expect(`${first} ${second}`).toBe(line);
  });

  it("returns an unsplittable spaceless line whole", () => {
    const word = "a".repeat(70);
    expect(wrapPoemLine(word)).toEqual([word]);
  });
});
