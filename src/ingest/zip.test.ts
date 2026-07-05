import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readExportZip } from "./zip";

function makeZip(): Uint8Array {
  return zipSync({
    "apple_health_export/export.xml": strToU8("<HealthData></HealthData>"),
    "apple_health_export/export_cda.xml": strToU8("<huge>ignored</huge>"),
    "apple_health_export/workout-routes/route_2024-07-23_10.03am.gpx":
      strToU8("<gpx>route1</gpx>"),
    "apple_health_export/electrocardiograms/ecg.csv": strToU8("ignored"),
  });
}

describe("readExportZip", () => {
  it("extracts only routes and export.xml, keyed by basename", async () => {
    const raw = await readExportZip(makeZip());
    expect(raw.exportXml).toBe("<HealthData></HealthData>");
    expect([...raw.gpxFiles.keys()]).toEqual(["route_2024-07-23_10.03am.gpx"]);
    expect(raw.gpxFiles.get("route_2024-07-23_10.03am.gpx")).toBe("<gpx>route1</gpx>");
  });

  it("handles a zip with no routes folder", async () => {
    const raw = await readExportZip(
      zipSync({ "apple_health_export/export.xml": strToU8("<HealthData/>") }),
    );
    expect(raw.gpxFiles.size).toBe(0);
    expect(raw.exportXml).toBe("<HealthData/>");
  });

  it("rejects on garbage bytes", async () => {
    await expect(readExportZip(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
