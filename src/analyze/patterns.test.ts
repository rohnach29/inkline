import { describe, it, expect } from "vitest";
import type { Run, Year } from "../ingest/types";
import {
  detectFirstLast,
  detectRecords,
  detectNightRuns,
  detectQuiets,
  detectStreaks,
  detectFalseStarts,
  detectMonths,
} from "./patterns";

/** Test helper: build a Run with sensible defaults. startUtc derives from
 * startLocal (treated as UTC) unless explicitly overridden — keeps test data
 * terse while staying fully deterministic (no Date.now(), no locale calls). */
function mkRun(partial: Partial<Run> & { startLocal: string }): Run {
  const startUtc = partial.startUtc ?? Date.parse(`${partial.startLocal}Z`);
  return {
    id: partial.id ?? partial.startLocal,
    startUtc,
    startLocal: partial.startLocal,
    tz: partial.tz ?? "UTC",
    timezoneUncertain: partial.timezoneUncertain ?? false,
    km: partial.km ?? 5,
    minutes: partial.minutes ?? 30,
    elevationGain: partial.elevationGain ?? 20,
    indoor: partial.indoor ?? false,
    track: partial.track,
    placeId: partial.placeId ?? null,
  };
}

function mkYear(runs: Run[]): Year {
  const utcs = runs.map((r) => r.startUtc);
  return {
    runs,
    places: [],
    span: {
      firstUtc: utcs.length ? Math.min(...utcs) : 0,
      lastUtc: utcs.length ? Math.max(...utcs) : 0,
    },
  };
}

const EMPTY_YEAR: Year = { runs: [], places: [], span: { firstUtc: 0, lastUtc: 0 } };

describe("empty year", () => {
  it("returns [] from every detector", () => {
    expect(detectFirstLast(EMPTY_YEAR)).toEqual([]);
    expect(detectRecords(EMPTY_YEAR)).toEqual([]);
    expect(detectNightRuns(EMPTY_YEAR)).toEqual([]);
    expect(detectQuiets(EMPTY_YEAR)).toEqual([]);
    expect(detectStreaks(EMPTY_YEAR)).toEqual([]);
    expect(detectFalseStarts(EMPTY_YEAR)).toEqual([]);
    expect(detectMonths(EMPTY_YEAR)).toEqual([]);
  });

  it("does not mutate the input year", () => {
    const runs = [
      mkRun({ startLocal: "2025-03-02T08:00:00" }),
      mkRun({ startLocal: "2025-03-01T08:00:00" }),
    ];
    const year = mkYear(runs);
    const before = [...year.runs];
    detectFirstLast(year);
    detectRecords(year);
    detectNightRuns(year);
    detectQuiets(year);
    detectStreaks(year);
    detectFalseStarts(year);
    detectMonths(year);
    expect(year.runs).toEqual(before);
    expect(year.runs[0]!.startLocal).toBe("2025-03-02T08:00:00"); // unsorted order preserved
  });
});

describe("detectFirstLast", () => {
  it("emits first-run and last-run keyed on startUtc, with km/startLocal/placeId", () => {
    const middle = mkRun({ startLocal: "2025-02-01T08:00:00", km: 3, placeId: "home" });
    const first = mkRun({ startLocal: "2025-01-01T08:00:00", km: 4, placeId: null });
    const last = mkRun({ startLocal: "2025-03-01T08:00:00", km: 6, placeId: "park" });
    const year = mkYear([middle, first, last]);
    const events = detectFirstLast(year);
    expect(events).toHaveLength(2);
    const firstEvt = events.find((e) => e.type === "first-run")!;
    const lastEvt = events.find((e) => e.type === "last-run")!;
    expect(firstEvt.runIds).toEqual([first.id]);
    expect(firstEvt.atUtc).toBe(first.startUtc);
    expect(firstEvt.magnitude).toBe(4);
    expect(firstEvt.data).toEqual({ km: 4, startLocal: "2025-01-01T08:00:00", placeId: "" });
    expect(lastEvt.runIds).toEqual([last.id]);
    expect(lastEvt.atUtc).toBe(last.startUtc);
    expect(lastEvt.data).toEqual({ km: 6, startLocal: "2025-03-01T08:00:00", placeId: "park" });
  });
});

describe("detectRecords — longest-run", () => {
  it("picks max km, tie broken by earliest startUtc", () => {
    const earlier = mkRun({ startLocal: "2025-01-01T08:00:00", km: 10.0 });
    const later = mkRun({ startLocal: "2025-01-05T08:00:00", km: 10.0 });
    const smaller = mkRun({ startLocal: "2025-01-03T08:00:00", km: 8.0 });
    const year = mkYear([smaller, later, earlier]);
    const events = detectRecords(year);
    const longest = events.find((e) => e.type === "longest-run")!;
    expect(longest.runIds).toEqual([earlier.id]);
    expect(longest.magnitude).toBe(10.0);
    expect(longest.data).toEqual({ km: 10.0, startLocal: "2025-01-01T08:00:00" });
  });

  it("skips when no run has km > 0", () => {
    const year = mkYear([mkRun({ startLocal: "2025-01-01T08:00:00", km: 0 })]);
    const events = detectRecords(year);
    expect(events.find((e) => e.type === "longest-run")).toBeUndefined();
  });
});

describe("detectRecords — fastest-run", () => {
  it("picks min pace among runs with km >= 3 and minutes > 0", () => {
    const fast = mkRun({ startLocal: "2025-01-01T08:00:00", km: 5, minutes: 19 }); // 3.8 min/km
    const slow = mkRun({ startLocal: "2025-01-02T08:00:00", km: 10, minutes: 40 }); // 4.0 min/km
    const tooShort = mkRun({ startLocal: "2025-01-03T08:00:00", km: 2, minutes: 5 }); // fast pace, excluded (km<3)
    const year = mkYear([slow, tooShort, fast]);
    const events = detectRecords(year);
    const fastest = events.find((e) => e.type === "fastest-run")!;
    expect(fastest.runIds).toEqual([fast.id]);
    expect(fastest.magnitude).toBeCloseTo(3.8, 10);
    expect(fastest.data["paceMinPerKm"]).toBeCloseTo(3.8, 10);
    expect(fastest.data["km"]).toBe(5);
    expect(fastest.data["startLocal"]).toBe("2025-01-01T08:00:00");
  });

  it("skips when no run qualifies (km < 3 or minutes <= 0)", () => {
    const year = mkYear([
      mkRun({ startLocal: "2025-01-01T08:00:00", km: 2, minutes: 20 }),
      mkRun({ startLocal: "2025-01-02T08:00:00", km: 5, minutes: 0 }),
    ]);
    const events = detectRecords(year);
    expect(events.find((e) => e.type === "fastest-run")).toBeUndefined();
  });

  it("ties on pace broken by earliest startUtc", () => {
    const earlier = mkRun({ startLocal: "2025-01-01T08:00:00", km: 10, minutes: 40 });
    const later = mkRun({ startLocal: "2025-01-02T08:00:00", km: 5, minutes: 20 }); // same pace 4.0
    const year = mkYear([later, earlier]);
    const events = detectRecords(year);
    const fastest = events.find((e) => e.type === "fastest-run")!;
    expect(fastest.runIds).toEqual([earlier.id]);
  });
});

describe("detectRecords — hilliest-run", () => {
  it("picks max elevationGain where gain > 0", () => {
    const hilly = mkRun({ startLocal: "2025-01-01T08:00:00", elevationGain: 500 });
    const flat = mkRun({ startLocal: "2025-01-02T08:00:00", elevationGain: 0 });
    const year = mkYear([flat, hilly]);
    const events = detectRecords(year);
    const hilliest = events.find((e) => e.type === "hilliest-run")!;
    expect(hilliest.runIds).toEqual([hilly.id]);
    expect(hilliest.magnitude).toBe(500);
    expect(hilliest.data).toEqual({ elevationGainM: 500, startLocal: "2025-01-01T08:00:00" });
  });

  it("skips when no run has elevationGain > 0", () => {
    const year = mkYear([mkRun({ startLocal: "2025-01-01T08:00:00", elevationGain: 0 })]);
    const events = detectRecords(year);
    expect(events.find((e) => e.type === "hilliest-run")).toBeUndefined();
  });
});

describe("detectRecords — earliest-run / latest-run", () => {
  it("picks min/max local time-of-day, excludes timezoneUncertain runs", () => {
    const early = mkRun({ startLocal: "2025-01-01T05:07:33" });
    const late = mkRun({ startLocal: "2025-01-02T20:15:00" });
    const uncertainButLater = mkRun({
      startLocal: "2025-01-03T23:59:00",
      timezoneUncertain: true,
    });
    const uncertainButEarlier = mkRun({
      startLocal: "2025-01-04T00:01:00",
      timezoneUncertain: true,
    });
    const year = mkYear([late, uncertainButLater, early, uncertainButEarlier]);
    const events = detectRecords(year);
    const earliest = events.find((e) => e.type === "earliest-run")!;
    const latest = events.find((e) => e.type === "latest-run")!;
    expect(earliest.runIds).toEqual([early.id]);
    expect(earliest.data["localTime"]).toBe("05:07");
    expect(earliest.data["startLocal"]).toBe("2025-01-01T05:07:33");
    expect(latest.runIds).toEqual([late.id]);
    expect(latest.data["localTime"]).toBe("20:15");
  });

  it("skips earliest/latest when every run is timezoneUncertain", () => {
    const year = mkYear([
      mkRun({ startLocal: "2025-01-01T05:00:00", timezoneUncertain: true }),
    ]);
    const events = detectRecords(year);
    expect(events.find((e) => e.type === "earliest-run")).toBeUndefined();
    expect(events.find((e) => e.type === "latest-run")).toBeUndefined();
  });
});

describe("detectNightRuns", () => {
  it("includes hour>=22 or hour<4, boundary: 03:59 in, 04:00 out, 22:00 in", () => {
    const at2200 = mkRun({ startLocal: "2025-01-01T22:00:00" });
    const at0359 = mkRun({ startLocal: "2025-01-02T03:59:00" });
    const at0400 = mkRun({ startLocal: "2025-01-02T04:00:00" }); // excluded, daytime
    const daytime = mkRun({ startLocal: "2025-01-02T12:00:00" }); // excluded, daytime
    const year = mkYear([daytime, at0400, at0359, at2200]);
    const events = detectNightRuns(year);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.runIds.sort()).toEqual([at0359.id, at2200.id].sort());
    expect(evt.data["count"]).toBe(2);
    expect(evt.magnitude).toBe(2);
  });

  it("excludes timezoneUncertain runs entirely", () => {
    const year = mkYear([
      mkRun({ startLocal: "2025-01-01T23:00:00", timezoneUncertain: true }),
    ]);
    expect(detectNightRuns(year)).toEqual([]);
  });

  it("picks the largest hour-shifted local time for latestLocalTime/latestStartLocal, atUtc = first chronologically", () => {
    const a = mkRun({ startLocal: "2025-01-01T22:30:00" }); // shifted 1800
    const b = mkRun({ startLocal: "2025-01-02T02:30:00" }); // shifted 16200
    const c = mkRun({ startLocal: "2025-01-02T03:30:00" }); // shifted 19800 (largest)
    const year = mkYear([c, a, b]);
    const events = detectNightRuns(year);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.atUtc).toBe(a.startUtc); // first chronologically
    expect(evt.data["latestLocalTime"]).toBe("03:30");
    expect(evt.data["latestStartLocal"]).toBe("2025-01-02T03:30:00");
    expect(evt.runIds).toEqual([a.id, b.id, c.id]); // chronological
  });

  it("returns [] when there are no night runs", () => {
    const year = mkYear([mkRun({ startLocal: "2025-01-01T12:00:00" })]);
    expect(detectNightRuns(year)).toEqual([]);
  });
});

describe("detectQuiets", () => {
  it("does not emit at exactly 21 days", () => {
    const a = mkRun({ startLocal: "2025-01-01T08:00:00" });
    const b = mkRun({ startLocal: "2025-01-22T08:00:00" }); // exactly 21 days later
    const year = mkYear([a, b]);
    expect(detectQuiets(year)).toEqual([]);
  });

  it("emits at 22 days with correct magnitude and data", () => {
    const a = mkRun({ startLocal: "2025-01-01T08:00:00" });
    const b = mkRun({ startLocal: "2025-01-23T08:00:00" }); // 22 days later
    const year = mkYear([b, a]);
    const events = detectQuiets(year);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.type).toBe("quiet");
    expect(evt.magnitude).toBe(22);
    expect(evt.atUtc).toBe(a.startUtc);
    expect(evt.runIds).toEqual([a.id, b.id]);
    expect(evt.data).toEqual({
      days: 22,
      fromLocal: "2025-01-01T08:00:00",
      toLocal: "2025-01-23T08:00:00",
    });
  });

  it("emits one quiet event per gap across multiple runs", () => {
    const a = mkRun({ startLocal: "2025-01-01T08:00:00" });
    const b = mkRun({ startLocal: "2025-01-02T08:00:00" }); // 1 day gap, no quiet
    const c = mkRun({ startLocal: "2025-02-05T08:00:00" }); // 34 days gap, quiet
    const year = mkYear([a, b, c]);
    const events = detectQuiets(year);
    expect(events).toHaveLength(1);
    expect(events[0]!.runIds).toEqual([b.id, c.id]);
  });
});

describe("detectStreaks", () => {
  it("does not emit a streak of 4 consecutive days", () => {
    const runs = ["01", "02", "03", "04"].map((d) =>
      mkRun({ startLocal: `2025-01-${d}T08:00:00` }),
    );
    expect(detectStreaks(mkYear(runs))).toEqual([]);
  });

  it("emits a streak of 5 consecutive days", () => {
    const runs = ["01", "02", "03", "04", "05"].map((d) =>
      mkRun({ startLocal: `2025-01-${d}T08:00:00` }),
    );
    const year = mkYear(runs);
    const events = detectStreaks(year);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.magnitude).toBe(5);
    expect(evt.data).toEqual({ days: 5, fromDate: "2025-01-01", toDate: "2025-01-05" });
    expect(evt.runIds).toEqual(runs.map((r) => r.id));
    expect(evt.atUtc).toBe(runs[0]!.startUtc);
  });

  it("counts multiple runs on the same date once toward the streak", () => {
    const day1a = mkRun({ startLocal: "2025-03-01T06:00:00", id: "day1a" });
    const day1b = mkRun({ startLocal: "2025-03-01T18:00:00", id: "day1b" });
    const day2 = mkRun({ startLocal: "2025-03-02T08:00:00" });
    const day3 = mkRun({ startLocal: "2025-03-03T08:00:00" });
    const day4 = mkRun({ startLocal: "2025-03-04T08:00:00" });
    const day5 = mkRun({ startLocal: "2025-03-05T08:00:00" });
    const year = mkYear([day1a, day1b, day2, day3, day4, day5]);
    const events = detectStreaks(year);
    expect(events).toHaveLength(1);
    expect(events[0]!.magnitude).toBe(5); // 5 distinct dates, not 6 runs
    expect(events[0]!.runIds).toEqual(["day1a", "day1b", day2.id, day3.id, day4.id, day5.id]);
  });

  it("breaks the streak across a gap and only reports runs of length >= 5", () => {
    const streakA = ["01", "02", "03", "04", "05"].map((d) =>
      mkRun({ startLocal: `2025-04-${d}T08:00:00` }),
    );
    const gapRun = mkRun({ startLocal: "2025-04-10T08:00:00" }); // breaks streak
    const shortB = ["11", "12"].map((d) => mkRun({ startLocal: `2025-04-${d}T08:00:00` }));
    const year = mkYear([...streakA, gapRun, ...shortB]);
    const events = detectStreaks(year);
    expect(events).toHaveLength(1);
    expect(events[0]!.data["fromDate"]).toBe("2025-04-01");
    expect(events[0]!.data["toDate"]).toBe("2025-04-05");
  });
});

describe("detectFalseStarts", () => {
  it("aggregates runs with 0 < km < 1", () => {
    const short1 = mkRun({ startLocal: "2025-01-01T08:00:00", km: 0.5 });
    const short2 = mkRun({ startLocal: "2025-01-02T08:00:00", km: 0.2 });
    const zero = mkRun({ startLocal: "2025-01-03T08:00:00", km: 0 }); // excluded
    const normal = mkRun({ startLocal: "2025-01-04T08:00:00", km: 5 }); // excluded
    const year = mkYear([normal, zero, short2, short1]);
    const events = detectFalseStarts(year);
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.magnitude).toBe(2);
    expect(evt.runIds).toEqual([short1.id, short2.id]);
    expect(evt.data).toEqual({
      count: 2,
      shortestKm: 0.2,
      shortestStartLocal: "2025-01-02T08:00:00",
    });
  });

  it("returns [] when no run qualifies", () => {
    const year = mkYear([mkRun({ startLocal: "2025-01-01T08:00:00", km: 5 })]);
    expect(detectFalseStarts(year)).toEqual([]);
  });
});

describe("detectMonths", () => {
  it("groups by year-month, sums km, tracks best single run, sorts by month", () => {
    const jan1 = mkRun({ startLocal: "2025-01-05T08:00:00", km: 5 });
    const jan2 = mkRun({ startLocal: "2025-01-20T08:00:00", km: 10 });
    const feb1 = mkRun({ startLocal: "2025-02-01T08:00:00", km: 3 });
    const year = mkYear([feb1, jan2, jan1]);
    const events = detectMonths(year);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.data["month"])).toEqual(["2025-01", "2025-02"]);
    const janEvt = events[0]!;
    expect(janEvt.magnitude).toBe(15);
    expect(janEvt.data).toEqual({ month: "2025-01", runs: 2, km: 15, bestKm: 10 });
    expect(janEvt.atUtc).toBe(jan1.startUtc);
    expect(janEvt.runIds).toEqual([jan1.id, jan2.id]);
  });
});
