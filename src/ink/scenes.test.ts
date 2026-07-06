import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { renderScene } from "./index";
import { SCENES } from "./scenes/index";
import type { SceneTag } from "./types";

const TAGS = Object.keys(SCENES) as SceneTag[];
const BIG = { km: 33, days: 21, count: 9, gainM: 480, paceMinPerKm: 4.4 };
const SMALL = { km: 4, days: 3, count: 2, gainM: 35, paceMinPerKm: 7.2 };
const PARAMETRIC: SceneTag[] = [
  "longest-run", "fastest-run", "hilliest-run", "night-runs",
  "streak", "quiet", "journey", "month", "false-starts", "route-champion", "hill-beast", "ghost-elevation",
];

describe.each(TAGS)("scene %s", (tag) => {
  it("renders deterministically, non-empty, within budget", () => {
    const a = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    expect(a).toBe(renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`)));
    expect(a).toContain("<svg");
    const paths = a.match(/<path /g)!.length;
    expect(paths).toBeGreaterThan(5);
    expect(paths).toBeLessThan(400);
  });
  it("uses token classes only — no literal colors", () => {
    const svg = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(|stroke="[^c]|fill="[^cn]/);
    expect(svg).not.toContain("url(#wobble)");
  });
  it("stays inside the viewBox", () => {
    const svg = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    // Coordinate numbers live in the path `d` attributes; scan only those. The
    // SVG header emitted by renderScene carries a literal "2000" (from the
    // xmlns "http://www.w3.org/2000/svg") that is not a drawing coordinate.
    const nums = [...svg.matchAll(/ d="([^"]*)"/g)]
      .flatMap((m) => m[1]!.match(/-?\d+(\.\d+)?/g) ?? [])
      .map(Number);
    // crude but effective: no coordinate far outside 240x200 (allow small negatives from wobble)
    for (const n of nums) expect(n).toBeGreaterThan(-12);
    expect(Math.max(...nums)).toBeLessThan(252);
  });
});

describe.each(PARAMETRIC.filter((t) => TAGS.includes(t)))("scene %s is data-driven", (tag) => {
  it("small vs large params change the drawing", () => {
    const s = renderScene(tag, SMALL, new Rng(5).fork(`p:${tag}`));
    const l = renderScene(tag, BIG, new Rng(5).fork(`p:${tag}`));
    expect(s).not.toBe(l);
  });
});
