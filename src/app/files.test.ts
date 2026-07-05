import { describe, it, expect } from "vitest";
import { routeFiles, gpxToRaw } from "./files";

function zipFile(name: string, type = "application/zip"): File {
  return new File(["PK\x03\x04fake"], name, { type });
}

function gpxFile(name: string, text = "<gpx/>"): File {
  return new File([text], name, { type: "application/gpx+xml" });
}

function textFile(name: string): File {
  return new File(["dross"], name, { type: "text/plain" });
}

describe("routeFiles", () => {
  it("zip beats gpx when both present", () => {
    const zip = zipFile("export.zip");
    const gpx = gpxFile("route.gpx");
    const route = routeFiles([gpx, zip]);
    expect(route.kind).toBe("zip");
    if (route.kind === "zip") {
      expect(route.file).toBe(zip);
    }
  });

  it("first zip wins when multiple zips present", () => {
    const zip1 = zipFile("first.zip");
    const zip2 = zipFile("second.zip");
    const route = routeFiles([zip1, zip2]);
    expect(route.kind).toBe("zip");
    if (route.kind === "zip") {
      expect(route.file).toBe(zip1);
    }
  });

  it("is case-insensitive for .ZIP", () => {
    const zip = zipFile("EXPORT.ZIP", "");
    const route = routeFiles([zip]);
    expect(route.kind).toBe("zip");
  });

  it("detects zip by mime type even without .zip extension", () => {
    const zip = zipFile("export", "application/zip");
    const route = routeFiles([zip]);
    expect(route.kind).toBe("zip");
  });

  it("gpx-only: all gpx files, non-gpx dross ignored, case-insensitive .GPX", () => {
    const a = gpxFile("a.gpx");
    const b = gpxFile("b.GPX");
    const dross = textFile("readme.txt");
    const route = routeFiles([a, dross, b]);
    expect(route.kind).toBe("gpx");
    if (route.kind === "gpx") {
      expect(route.files).toEqual([a, b]);
    }
  });

  it("returns none when files list is empty", () => {
    expect(routeFiles([])).toEqual({ kind: "none" });
  });

  it("returns none when no zip and no gpx present", () => {
    const dross = textFile("readme.txt");
    expect(routeFiles([dross])).toEqual({ kind: "none" });
  });
});

describe("gpxToRaw", () => {
  it("maps file names to their text content, with a null exportXml", async () => {
    const a = gpxFile("a.gpx", "<gpx>A</gpx>");
    const b = gpxFile("b.gpx", "<gpx>B</gpx>");
    const raw = await gpxToRaw([a, b]);
    expect(raw.exportXml).toBeNull();
    expect(raw.gpxFiles.size).toBe(2);
    expect(raw.gpxFiles.get("a.gpx")).toBe("<gpx>A</gpx>");
    expect(raw.gpxFiles.get("b.gpx")).toBe("<gpx>B</gpx>");
  });

  it("returns an empty map for an empty file list", async () => {
    const raw = await gpxToRaw([]);
    expect(raw.gpxFiles.size).toBe(0);
    expect(raw.exportXml).toBeNull();
  });
});
