import { describe, expect, it } from "vitest";
import type { StoryEvent } from "../../analyze/types";
import {
  featuresFor,
  hourBandOf,
  isMonsoonRegion,
  localStampFor,
  seasonOf,
  weekdayOf,
} from "./features";

function ev(type: StoryEvent["type"], data: StoryEvent["data"]): StoryEvent {
  return { type, runIds: ["r1"], atUtc: 1_700_000_000_000, magnitude: 1, data };
}

describe("weekdayOf (Sakamoto)", () => {
  it("matches known dates", () => {
    expect(weekdayOf("2025-10-27")).toBe("Monday");
    expect(weekdayOf("2026-07-06")).toBe("Monday");
    expect(weekdayOf("2000-01-01")).toBe("Saturday");
    expect(weekdayOf("2024-02-29")).toBe("Thursday");
    expect(weekdayOf("1999-12-31")).toBe("Friday");
  });
});

describe("hourBandOf", () => {
  it("maps boundary hours to bands", () => {
    expect(hourBandOf("03:59")).toBe("night");
    expect(hourBandOf("04:00")).toBe("dawn");
    expect(hourBandOf("06:59")).toBe("dawn");
    expect(hourBandOf("07:00")).toBe("morning");
    expect(hourBandOf("10:59")).toBe("morning");
    expect(hourBandOf("11:00")).toBe("day");
    expect(hourBandOf("16:59")).toBe("day");
    expect(hourBandOf("17:00")).toBe("evening");
    expect(hourBandOf("20:59")).toBe("evening");
    expect(hourBandOf("21:00")).toBe("night");
    expect(hourBandOf("00:15")).toBe("night");
  });
});

describe("seasonOf", () => {
  it("gives meteorological seasons in the north", () => {
    expect(seasonOf(4, 40)).toBe("spring");
    expect(seasonOf(7, 40)).toBe("summer");
    expect(seasonOf(10, 40)).toBe("autumn");
    expect(seasonOf(1, 40)).toBe("winter");
  });
  it("flips hemispheres south of the equator", () => {
    expect(seasonOf(7, -34)).toBe("winter");
    expect(seasonOf(1, -34)).toBe("summer");
    expect(seasonOf(10, -34)).toBe("spring");
  });
  it("overrides with monsoon inside the belt during June-September", () => {
    expect(seasonOf(7, 19, 73)).toBe("monsoon");
    expect(seasonOf(5, 19, 73)).toBe("spring");
    expect(seasonOf(7, 19)).toBe("summer");
    expect(seasonOf(7, 40, 73)).toBe("summer");
  });
});

describe("isMonsoonRegion", () => {
  it("bounds the belt", () => {
    expect(isMonsoonRegion(19, 73)).toBe(true);
    expect(isMonsoonRegion(40, 73)).toBe(false);
    expect(isMonsoonRegion(19, 100)).toBe(false);
  });
});

describe("localStampFor", () => {
  it("prefers event data over context, in priority order", () => {
    const e = ev("night-runs", { latestStartLocal: "2025-08-02T23:10:00", count: 4 });
    expect(localStampFor(e, { startLocal: "2025-01-01T09:00:00" })).toEqual({
      date: "2025-08-02",
      hm: "23:10",
    });
  });
  it("treats streak fromDate as date-only", () => {
    const e = ev("streak", { fromDate: "2025-03-10", days: 6 });
    expect(localStampFor(e, {})).toEqual({ date: "2025-03-10" });
  });
  it("falls back to the context stamp, then to nothing", () => {
    const e = ev("month", { month: "2025-06", runs: 9, km: 55 });
    expect(localStampFor(e, { startLocal: "2025-06-14T06:30:00" })).toEqual({
      date: "2025-06-14",
      hm: "06:30",
    });
    expect(localStampFor(e, {})).toEqual({});
  });
});

describe("featuresFor", () => {
  it("computes all features when data is complete", () => {
    const e = ev("longest-run", { km: 21, startLocal: "2025-10-27T05:47:00" });
    expect(featuresFor(e, { placeLat: 40.4, placeLon: -86.9 }, "large")).toEqual({
      hourBand: "dawn",
      weekday: "Monday",
      season: "autumn",
      band: "large",
    });
  });
  it("degrades every missing input to undefined", () => {
    const e = ev("month", { month: "2025-06", runs: 9, km: 55 });
    expect(featuresFor(e, {})).toEqual({});
  });
  it("computes season from data.month when no date stamp exists", () => {
    const e = ev("month", { month: "2025-07", runs: 9, km: 55 });
    expect(featuresFor(e, { placeLat: 19, placeLon: 73 })).toEqual({ season: "monsoon" });
  });
  it("omits season without a place latitude", () => {
    const e = ev("longest-run", { km: 21, startLocal: "2025-10-27T05:47:00" });
    expect(featuresFor(e, {})).toEqual({ hourBand: "dawn", weekday: "Monday" });
  });
});
