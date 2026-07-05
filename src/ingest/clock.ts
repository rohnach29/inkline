import tzlookup from "tz-lookup";

export interface RunClock {
  tz: string;
  startLocal: string;
  timezoneUncertain: boolean;
}

/**
 * The timezone law: a run's local time comes from its own first GPS
 * coordinate. Device clocks, filenames, and export settings are never
 * trusted. GPS-less runs fall back and are flagged uncertain.
 */
export function runClock(
  startUtc: number,
  firstPoint?: { lat: number; lon: number },
  fallbackTz = "UTC",
): RunClock {
  const tz = firstPoint ? tzlookup(firstPoint.lat, firstPoint.lon) : fallbackTz;
  // sv-SE locale formats as "YYYY-MM-DD HH:mm:ss" — stable and parseable.
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(startUtc));
  return {
    tz,
    startLocal: formatted.replace(" ", "T"),
    timezoneUncertain: !firstPoint,
  };
}
