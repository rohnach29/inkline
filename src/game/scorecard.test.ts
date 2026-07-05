import { describe, it, expect } from "vitest";
import { Rng } from "../storytell/rng";
import { cardLine, scoreCardSvg, type ScoreFacts } from "./scorecard";

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

  it("includes the wobble-card filter id exactly once", () => {
    const matches = svg.match(/wobble-card/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("has no leftover template braces", () => {
    expect(svg).not.toContain("{");
  });

  it("includes the poem line", () => {
    expect(svg).toContain(line);
  });

  it("includes the title", () => {
    expect(svg).toContain("OUTRUN THE QUIET");
  });

  it("handles a null furthestBeast without crashing or leaving artifacts", () => {
    const noBeast: ScoreFacts = { ...facts, furthestBeast: null };
    const out = scoreCardSvg(noBeast, line);
    expect(out.startsWith("<svg")).toBe(true);
    expect(out).not.toContain("{");
  });
});
