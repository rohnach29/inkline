import { describe, it, expect } from "vitest";
import { Rng } from "./rng";
import {
  nameHill,
  nameRoute,
  nameQuiet,
  nameGhost,
  nameNightBeast,
  bookTitle,
} from "./names";

const KEYS10 = [
  "hill-a",
  "hill-b",
  "hill-c",
  "hill-d",
  "hill-e",
  "hill-f",
  "hill-g",
  "hill-h",
  "hill-i",
  "hill-j",
];

const FUZZ_KEYS = Array.from({ length: 20 }, (_, i) => `fuzz-key-${i}`);

describe("nameHill", () => {
  it("is order-independent: calling b then a gives same names as a then b", () => {
    const rngAB = new Rng(42);
    const a1 = nameHill(rngAB, "a");
    const b1 = nameHill(rngAB, "b");

    const rngBA = new Rng(42);
    const b2 = nameHill(rngBA, "b");
    const a2 = nameHill(rngBA, "a");

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(nameHill(r1, "same-key")).toBe(nameHill(r2, "same-key"));
  });

  it("produces at least 6 distinct names across 10 keys with seed 42", () => {
    const rng = new Rng(42);
    const names = KEYS10.map((k) => nameHill(rng, k));
    const distinct = new Set(names);
    expect(distinct.size).toBeGreaterThanOrEqual(6);
  });

  it("returns non-empty strings for 20 fuzz keys", () => {
    const rng = new Rng(1234);
    for (const k of FUZZ_KEYS) {
      expect(nameHill(rng, k).length).toBeGreaterThan(0);
    }
  });
});

describe("nameRoute", () => {
  it("is order-independent", () => {
    const rngAB = new Rng(42);
    const a1 = nameRoute(rngAB, "a");
    const b1 = nameRoute(rngAB, "b");

    const rngBA = new Rng(42);
    const b2 = nameRoute(rngBA, "b");
    const a2 = nameRoute(rngBA, "a");

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(nameRoute(r1, "same-key")).toBe(nameRoute(r2, "same-key"));
  });

  it("returns non-empty strings for 20 fuzz keys", () => {
    const rng = new Rng(1234);
    for (const k of FUZZ_KEYS) {
      expect(nameRoute(rng, k).length).toBeGreaterThan(0);
    }
  });
});

describe("nameQuiet", () => {
  it("is order-independent", () => {
    const rngAB = new Rng(42);
    const a1 = nameQuiet(rngAB, "a", 40);
    const b1 = nameQuiet(rngAB, "b", 132);

    const rngBA = new Rng(42);
    const b2 = nameQuiet(rngBA, "b", 132);
    const a2 = nameQuiet(rngBA, "a", 40);

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(nameQuiet(r1, "same-key", 50)).toBe(nameQuiet(r2, "same-key", 50));
  });

  it('contains "Quiet" for days=132', () => {
    const rng = new Rng(42);
    expect(nameQuiet(rng, "k", 132)).toContain("Quiet");
  });

  it('contains "Quiet" for a short-quiet count too', () => {
    const rng = new Rng(42);
    expect(nameQuiet(rng, "k", 12)).toContain("Quiet");
  });

  it("returns non-empty strings for 20 fuzz keys", () => {
    const rng = new Rng(1234);
    for (const k of FUZZ_KEYS) {
      expect(nameQuiet(rng, k, 30).length).toBeGreaterThan(0);
    }
  });
});

describe("nameGhost", () => {
  it("is order-independent", () => {
    const rngAB = new Rng(42);
    const a1 = nameGhost(rngAB, "a");
    const b1 = nameGhost(rngAB, "b");

    const rngBA = new Rng(42);
    const b2 = nameGhost(rngBA, "b");
    const a2 = nameGhost(rngBA, "a");

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(nameGhost(r1, "same-key")).toBe(nameGhost(r2, "same-key"));
  });

  it("returns non-empty strings for 20 fuzz keys", () => {
    const rng = new Rng(1234);
    for (const k of FUZZ_KEYS) {
      expect(nameGhost(rng, k).length).toBeGreaterThan(0);
    }
  });
});

describe("nameNightBeast", () => {
  it("embeds the exact localTime string", () => {
    const rng = new Rng(42);
    expect(nameNightBeast(rng, "k", "23:41")).toContain("23:41");
  });

  it("is order-independent", () => {
    const rngAB = new Rng(42);
    const a1 = nameNightBeast(rngAB, "a", "01:15");
    const b1 = nameNightBeast(rngAB, "b", "02:30");

    const rngBA = new Rng(42);
    const b2 = nameNightBeast(rngBA, "b", "02:30");
    const a2 = nameNightBeast(rngBA, "a", "01:15");

    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(nameNightBeast(r1, "same-key", "03:00")).toBe(
      nameNightBeast(r2, "same-key", "03:00"),
    );
  });

  it("returns non-empty strings for 20 fuzz keys", () => {
    const rng = new Rng(1234);
    for (const k of FUZZ_KEYS) {
      expect(nameNightBeast(rng, k, "04:20").length).toBeGreaterThan(0);
    }
  });
});

describe("bookTitle", () => {
  it("returns a non-empty string", () => {
    const rng = new Rng(42);
    expect(bookTitle(rng).length).toBeGreaterThan(0);
  });

  it("is stable across two fresh Rng(7) instances", () => {
    const r1 = new Rng(7);
    const r2 = new Rng(7);
    expect(bookTitle(r1)).toBe(bookTitle(r2));
  });
});
