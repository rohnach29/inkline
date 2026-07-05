import { describe, it, expect } from "vitest";
import { runClock } from "./clock";

describe("runClock (timezone law)", () => {
  it("derives Mumbai local time from coordinates", () => {
    const c = runClock(Date.parse("2024-07-23T04:18:57Z"), {
      lat: 19.096888,
      lon: 72.919684,
    });
    expect(c.tz).toBe("Asia/Kolkata");
    expect(c.startLocal).toBe("2024-07-23T09:48:57"); // UTC+5:30
    expect(c.timezoneUncertain).toBe(false);
  });

  it("turns the 'midnight' Indiana run into a morning run", () => {
    // The real bug this law exists for: filename said 12:46am IST,
    // the run actually started 10:49am Eastern.
    const c = runClock(Date.parse("2025-10-26T14:49:03Z"), {
      lat: 40.423,
      lon: -86.906,
    });
    expect(c.startLocal).toBe("2025-10-26T10:49:03"); // EDT, UTC-4
    expect(c.timezoneUncertain).toBe(false);
  });

  it("flags GPS-less runs as timezone-uncertain and uses the fallback", () => {
    const c = runClock(Date.parse("2025-01-01T12:00:00Z"), undefined, "Asia/Kolkata");
    expect(c.tz).toBe("Asia/Kolkata");
    expect(c.startLocal).toBe("2025-01-01T17:30:00");
    expect(c.timezoneUncertain).toBe(true);
  });
});
