import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("runs tests with strict TS", () => {
    const x: number = 2;
    expect(x + x).toBe(4);
  });
});
