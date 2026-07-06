import { describe, expect, it } from "vitest";
import type { StoryEvent } from "../../analyze/types";
import { slotValues } from "./slots";

const ev = (type: string, data: StoryEvent["data"]): StoryEvent =>
  ({ type: type as StoryEvent["type"], runIds: ["r1"], atUtc: 1, magnitude: 1, data });

describe("slotValues: clock/weekday/times", () => {
  it("derives a 12-hour clock and weekday from the event stamp", () => {
    const v = slotValues(ev("longest-run", { km: 21, startLocal: "2025-10-27T05:47:00" }), {});
    expect(v.clock).toBe("5:47");
    expect(v.weekday).toBe("Monday");
  });
  it("wraps midnight and noon correctly", () => {
    expect(slotValues(ev("latest-run", { localTime: "00:12", startLocal: "2025-07-05T00:12:00" }), {}).clock).toBe("12:12");
    expect(slotValues(ev("latest-run", { localTime: "12:05", startLocal: "2025-07-05T12:05:00" }), {}).clock).toBe("12:05");
  });
  it("gives streak a weekday but no clock (date-only source)", () => {
    const v = slotValues(ev("streak", { days: 6, fromDate: "2025-03-10" }), {});
    expect(v.weekday).toBe("Monday");
    expect(v.clock).toBeUndefined();
  });
  it("rounds hill-beast times", () => {
    expect(slotValues(ev("hill-beast", { gainM: 80, times: 6.7 }), {}).times).toBe("7");
  });
  it("omits all three when no source exists", () => {
    const v = slotValues(ev("month", { month: "2025-06", runs: 4, km: 30 }), {});
    expect(v.clock).toBeUndefined();
    expect(v.weekday).toBeUndefined();
    expect(v.times).toBeUndefined();
  });
  it("falls back to the context stamp", () => {
    const v = slotValues(ev("journey", { km: 8000 }), { startLocal: "2025-06-14T06:30:00" });
    expect(v.clock).toBe("6:30");
    expect(v.weekday).toBe("Saturday");
  });
});
