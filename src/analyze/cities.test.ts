import { describe, it, expect } from "vitest";
import { CITIES, nearestCity } from "./cities";

const REQUIRED_NAMES = [
  "Mumbai",
  "Indianapolis",
  "Lafayette (Indiana)",
  "Chicago",
  "Raleigh",
  "Delhi",
  "Bengaluru",
  "Pune",
  "New York",
  "San Francisco",
  "London",
  "Tokyo",
];

describe("CITIES", () => {
  it("has between 250 and 320 entries", () => {
    expect(CITIES.length).toBeGreaterThanOrEqual(250);
    expect(CITIES.length).toBeLessThanOrEqual(320);
  });

  it("includes all required cities", () => {
    for (const name of REQUIRED_NAMES) {
      expect(CITIES.some((c) => c.name === name)).toBe(true);
    }
  });

  it("gives every entry 2-decimal-ish, plausible coordinates", () => {
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });
});

describe("nearestCity", () => {
  it("finds Mumbai exactly at its own coordinates", () => {
    const city = nearestCity(19.08, 72.88);
    expect(city).not.toBeNull();
    expect(city!.name).toBe("Mumbai");
  });

  it("returns null for a point in the mid-Pacific, far from any city", () => {
    expect(nearestCity(0, -160)).toBeNull();
  });

  it("still resolves a point ~50km from London", () => {
    const closeLat = 51.51 + 50 / 111.32;
    const close = nearestCity(closeLat, -0.13);
    expect(close?.name).toBe("London");
  });
});
