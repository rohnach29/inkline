import { describe, expect, it } from "vitest";
import type { PoemUnit } from "./forms";
import { matches, realizeLines } from "./realize";

const UNITS: readonly PoemUnit[] = [
  { text: "I laced my shoes at {clock} today," },
  {
    branch: {
      variants: [
        { when: { hourBand: ["dawn"] }, lines: [{ text: "before the sun had much to say," }] },
        { when: { hourBand: ["night"] }, lines: [{ text: "so late the moon looked my way," }] },
      ],
      default: [{ text: "and off I went the usual way," }],
    },
  },
  { text: "and ran." },
];

describe("matches", () => {
  it("requires every listed key to match", () => {
    expect(matches({ hourBand: ["dawn"], weekday: ["Monday"] }, { hourBand: "dawn", weekday: "Monday" })).toBe(true);
    expect(matches({ hourBand: ["dawn"], weekday: ["Monday"] }, { hourBand: "dawn", weekday: "Sunday" })).toBe(false);
  });
  it("never matches on an undefined feature", () => {
    expect(matches({ season: ["monsoon"] }, {})).toBe(false);
  });
  it("matches any listed value", () => {
    expect(matches({ hourBand: ["dawn", "morning"] }, { hourBand: "morning" })).toBe(true);
  });
});

describe("realizeLines", () => {
  it("passes plain lines through and picks the matching variant", () => {
    expect(realizeLines(UNITS, { hourBand: "night" }).map((l) => l.text)).toEqual([
      "I laced my shoes at {clock} today,",
      "so late the moon looked my way,",
      "and ran.",
    ]);
  });
  it("first matching variant wins", () => {
    const units: readonly PoemUnit[] = [{
      branch: {
        variants: [
          { when: { hourBand: ["dawn"] }, lines: [{ text: "first" }] },
          { when: { hourBand: ["dawn", "morning"] }, lines: [{ text: "second" }] },
        ],
        default: [{ text: "default" }],
      },
    }];
    expect(realizeLines(units, { hourBand: "dawn" })[0]!.text).toBe("first");
  });
  it("falls to the default when nothing matches", () => {
    expect(realizeLines(UNITS, {}).map((l) => l.text)[1]).toBe("and off I went the usual way,");
  });
  it("is pure — same inputs, same output, inputs untouched", () => {
    const before = JSON.stringify(UNITS);
    const a = realizeLines(UNITS, { hourBand: "dawn" });
    const b = realizeLines(UNITS, { hourBand: "dawn" });
    expect(a).toEqual(b);
    expect(JSON.stringify(UNITS)).toBe(before);
  });
});
