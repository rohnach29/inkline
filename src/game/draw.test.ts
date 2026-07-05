import { describe, it, expect } from "vitest";
import { verticalScale } from "./draw";

describe("verticalScale", () => {
  it("caps at 3 for a perfectly flat elevation range", () => {
    expect(verticalScale(0, 0)).toBe(3);
    expect(verticalScale(100, 100)).toBe(3);
  });

  it("is exactly 3 at the boundary where 120/range === 3 (range 40)", () => {
    expect(verticalScale(0, 40)).toBe(3);
  });

  it("scales down for elevation ranges bigger than the boundary", () => {
    expect(verticalScale(0, 60)).toBe(2);
    expect(verticalScale(0, 120)).toBe(1);
    expect(verticalScale(0, 1200)).toBeCloseTo(0.1, 10);
  });

  it("never divides by zero for a degenerate (equal min/max) range", () => {
    expect(() => verticalScale(50, 50)).not.toThrow();
    expect(verticalScale(50, 50)).toBe(3);
  });

  it("treats a negative-to-positive range the same as an equal-sized positive range", () => {
    expect(verticalScale(-30, 30)).toBe(2); // range 60, same as [0,60]
  });

  it("is always <= 3 regardless of how small the range gets", () => {
    expect(verticalScale(0, 1)).toBeLessThanOrEqual(3);
    expect(verticalScale(0, 0.001)).toBeLessThanOrEqual(3);
  });
});
