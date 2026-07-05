import { describe, it, expect } from "vitest";
import { hashString, seedFromYear, Rng } from "./rng";
import type { Year, Run } from "../ingest";

describe("hashString", () => {
  it("returns identical values for identical inputs", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("differs for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const h = hashString("some longer test string here");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("does not throw on empty string", () => {
    expect(() => hashString("")).not.toThrow();
    expect(typeof hashString("")).toBe("number");
  });
});

describe("Rng", () => {
  it("produces identical first 10 next() values for the same seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = new Rng(42);
    const b = new Rng(43);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() always returns a value in [0, 1)", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(6) over 600 draws covers every value 0-5", () => {
    const r = new Rng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const v = r.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  it("pick returns the sole element of a singleton array", () => {
    const r = new Rng(1);
    expect(r.pick(["a"])).toBe("a");
  });

  it("pick throws on an empty array", () => {
    const r = new Rng(1);
    expect(() => r.pick([])).toThrow();
  });

  it("fork with the same label twice gives identical streams", () => {
    const parent = new Rng(5);
    const forkA = parent.fork("x");
    const forkB = parent.fork("x");
    const seqA = Array.from({ length: 10 }, () => forkA.next());
    const seqB = Array.from({ length: 10 }, () => forkB.next());
    expect(seqA).toEqual(seqB);
  });

  it("fork does not advance the parent stream", () => {
    const parent = new Rng(5);
    const twin = new Rng(5);
    parent.fork("y");
    const parentSeq = Array.from({ length: 10 }, () => parent.next());
    const twinSeq = Array.from({ length: 10 }, () => twin.next());
    expect(parentSeq).toEqual(twinSeq);
  });
});

describe("seedFromYear", () => {
  const makeRun = (id: string, km: number): Run => ({
    id,
    startUtc: 1_700_000_000_000,
    startLocal: "2023-11-14T22:13:20",
    tz: "UTC",
    timezoneUncertain: false,
    km,
    minutes: 30,
    elevationGain: 10,
    indoor: false,
    placeId: null,
  });

  const makeYear = (runs: Run[]): Year => ({
    runs,
    places: [],
    span: { firstUtc: 1_700_000_000_000, lastUtc: 1_700_100_000_000 },
  });

  it("is stable for the same Year data", () => {
    const y1 = makeYear([makeRun("run-1", 5.123), makeRun("run-2", 10.5)]);
    const y2 = makeYear([makeRun("run-1", 5.123), makeRun("run-2", 10.5)]);
    expect(seedFromYear(y1)).toBe(seedFromYear(y2));
  });

  it("changes when a run's km changes", () => {
    const y1 = makeYear([makeRun("run-1", 5.123), makeRun("run-2", 10.5)]);
    const y2 = makeYear([makeRun("run-1", 5.999), makeRun("run-2", 10.5)]);
    expect(seedFromYear(y1)).not.toBe(seedFromYear(y2));
  });

  it("matches the documented derivation formula", () => {
    const year = makeYear([makeRun("run-1", 5.123), makeRun("run-2", 10.5)]);
    const expected = hashString(
      year.runs.map((r) => `${r.id}:${r.km.toFixed(3)}`).join("|"),
    );
    expect(seedFromYear(year)).toBe(expected);
  });
});
