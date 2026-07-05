import { describe, it, expect } from "vitest";
import { rejectionPage, brokenZipPage } from "./errors";

describe("rejectionPage", () => {
  it("contains no literal 'Error'", () => {
    expect(rejectionPage()).not.toMatch(/Error/);
  });

  it("is a page section", () => {
    expect(rejectionPage()).toMatch(/class="page/);
  });

  it("contains how-to-export steps mentioning Export All Health Data", () => {
    expect(rejectionPage()).toContain("Export All Health Data");
  });
});

describe("brokenZipPage", () => {
  it("contains no literal 'Error'", () => {
    expect(brokenZipPage()).not.toMatch(/Error/);
  });

  it("is a page section", () => {
    expect(brokenZipPage()).toMatch(/class="page/);
  });

  it("suggests re-exporting", () => {
    expect(brokenZipPage()).toMatch(/re-export/i);
  });
});
