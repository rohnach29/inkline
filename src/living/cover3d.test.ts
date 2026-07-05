import { describe, it, expect } from "vitest";
import { coverClassFor } from "./cover3d";

describe("coverClassFor", () => {
  it('maps "over" to "lift"', () => {
    expect(coverClassFor("over")).toBe("lift");
  });

  it('maps "leave" to "" (no class — resets to resting state)', () => {
    expect(coverClassFor("leave")).toBe("");
  });

  it('maps "drop" to "open"', () => {
    expect(coverClassFor("drop")).toBe("open");
  });
});
