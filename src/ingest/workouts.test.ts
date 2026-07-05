import { describe, it, expect } from "vitest";
import { WorkoutScanner, parseAppleDate } from "./workouts";

const WORKOUT = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="34.79" durationUnit="min" sourceName="Watch" startDate="2024-08-22 02:19:51 +0530" endDate="2024-08-22 02:54:38 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2024-08-22 02:19:51 +0530" endDate="2024-08-22 02:54:38 +0530" sum="5.25301" unit="km"/>
</Workout>`;

const INDOOR = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="20.1" durationUnit="min" startDate="2025-01-05 07:00:00 +0530" endDate="2025-01-05 07:20:06 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
</Workout>`;

describe("parseAppleDate", () => {
  it("parses Apple's 'YYYY-MM-DD HH:mm:ss +ZZZZ' format", () => {
    expect(parseAppleDate("2024-08-22 02:19:51 +0530")).toBe(
      Date.parse("2024-08-21T20:49:51Z"),
    );
    expect(parseAppleDate("nonsense")).toBeNaN();
  });
});

describe("WorkoutScanner", () => {
  it("extracts complete workout records", () => {
    const s = new WorkoutScanner();
    s.push(`<HealthData>${WORKOUT}${INDOOR}</HealthData>`);
    expect(s.workouts).toHaveLength(2);
    const w = s.workouts[0]!;
    expect(w.activity).toBe("HKWorkoutActivityTypeRunning");
    expect(w.startUtc).toBe(Date.parse("2024-08-21T20:49:51Z"));
    expect(w.durationMin).toBeCloseTo(34.79);
    expect(w.km).toBeCloseTo(5.253, 3);
    expect(w.indoor).toBe(false);
    expect(s.workouts[1]!.indoor).toBe(true);
    expect(s.workouts[1]!.km).toBeNull();
  });

  it("survives a workout split across chunk boundaries", () => {
    const s = new WorkoutScanner();
    const whole = `<HealthData>${WORKOUT}</HealthData>`;
    const cut = whole.indexOf("endDate"); // split mid-attribute
    s.push(whole.slice(0, cut));
    s.push(whole.slice(cut));
    expect(s.workouts).toHaveLength(1);
    expect(s.workouts[0]!.km).toBeCloseTo(5.253, 3);
  });

  it("converts legacy totalDistance miles to km", () => {
    const s = new WorkoutScanner();
    s.push(
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" totalDistance="3.1" totalDistanceUnit="mi" startDate="2020-01-01 08:00:00 +0000" endDate="2020-01-01 08:30:00 +0000"></Workout>`,
    );
    expect(s.workouts[0]!.km).toBeCloseTo(4.989, 2);
  });

  it("bounds the buffer when an open <Workout never closes, then resyncs", () => {
    const s = new WorkoutScanner();
    s.push(
      `<Workout workoutActivityType="X" startDate="2020-01-01 08:00:00 +0000" endDate="2020-01-01 08:30:00 +0000">`,
    );
    for (let i = 0; i < 3; i++) s.push("x".repeat(600_000));
    expect((s as unknown as { buf: string }).buf.length).toBeLessThanOrEqual(1_000_000);
    expect(s.workouts).toHaveLength(0);
    s.push(
      `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="10" durationUnit="min" startDate="2020-01-02 08:00:00 +0000" endDate="2020-01-02 08:10:00 +0000"></Workout>`,
    );
    expect(s.workouts).toHaveLength(1);
  });
});
