import { describe, it, expect } from "vitest";
import { buildYear } from "./year";
import type { RawExport } from "./zip";

function gpx(points: Array<[number, number, string]>): string {
  const body = points
    .map(
      ([lat, lon, iso]) =>
        `<trkpt lon="${lon}" lat="${lat}"><ele>10</ele><time>${iso}</time></trkpt>`,
    )
    .join("\n");
  return `<gpx><trk><trkseg>${body}</trkseg></trk></gpx>`;
}

// 12-point Mumbai run, 2024-07-23 04:18:57Z → 04:29:57Z (11 min)
const MUMBAI = gpx(
  Array.from({ length: 12 }, (_, i) => [
    19.0969 + i * 0.001,
    72.9197,
    new Date(Date.parse("2024-07-23T04:18:57Z") + i * 60_000).toISOString().replace(".000", ""),
  ]),
);

// 12-point Indiana run, 2025-10-26 14:49:03Z
const INDIANA = gpx(
  Array.from({ length: 12 }, (_, i) => [
    40.423 + i * 0.001,
    -86.906,
    new Date(Date.parse("2025-10-26T14:49:03Z") + i * 60_000).toISOString().replace(".000", ""),
  ]),
);

const EXPORT_XML = `<HealthData>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="11.0" durationUnit="min" startDate="2024-07-23 09:48:57 +0530" endDate="2024-07-23 09:59:57 +0530">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="1.99" unit="km"/>
</Workout>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30.0" durationUnit="min" startDate="2025-02-01 08:00:00 +0530" endDate="2025-02-01 08:30:00 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
</Workout>
<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60.0" durationUnit="min" startDate="2025-03-01 08:00:00 +0530" endDate="2025-03-01 09:00:00 +0530"/>
</HealthData>`;

function raw(): RawExport {
  return {
    gpxFiles: new Map([
      ["route_a.gpx", MUMBAI],
      ["route_b.gpx", INDIANA],
    ]),
    exportXml: EXPORT_XML,
  };
}

describe("buildYear", () => {
  it("builds runs from tracks with GPS-derived local times", () => {
    const year = buildYear(raw());
    const gps = year.runs.filter((r) => r.track);
    expect(gps).toHaveLength(2);
    expect(gps[0]!.tz).toBe("Asia/Kolkata");
    expect(gps[0]!.startLocal).toBe("2024-07-23T09:48:57");
    expect(gps[1]!.startLocal).toBe("2025-10-26T10:49:03"); // morning, not midnight
  });

  it("prefers workout distance over GPS distance when matched", () => {
    const year = buildYear(raw());
    expect(year.runs[0]!.km).toBe(1.99); // from workout, not track math
    expect(year.runs[0]!.minutes).toBe(11.0);
  });

  it("includes unmatched running workouts as GPS-less runs, excludes cycling", () => {
    const year = buildYear(raw());
    expect(year.runs).toHaveLength(3); // 2 GPS + 1 indoor; cycling dropped
    const indoor = year.runs.find((r) => r.indoor)!;
    expect(indoor.timezoneUncertain).toBe(true);
    expect(indoor.tz).toBe("Asia/Kolkata"); // majority tz of GPS runs? No — tie; earliest wins
  });

  it("clusters places and computes span", () => {
    const year = buildYear(raw());
    expect(year.places).toHaveLength(2); // Mumbai, Indiana
    expect(year.places[0]!.runCount).toBe(1);
    expect(year.span.firstUtc).toBe(Date.parse("2024-07-23T04:18:57Z"));
    expect(year.span.lastUtc).toBe(Date.parse("2025-10-26T14:49:03Z"));
  });

  it("returns an empty Year for an empty export", () => {
    const year = buildYear({ gpxFiles: new Map(), exportXml: null });
    expect(year.runs).toEqual([]);
    expect(year.places).toEqual([]);
    expect(year.span).toEqual({ firstUtc: 0, lastUtc: 0 });
  });
});
