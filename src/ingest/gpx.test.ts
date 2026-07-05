import { describe, it, expect } from "vitest";
import { parseGpx } from "./gpx";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Apple Health Export">
  <trk><trkseg>
    <trkpt lon="72.919684" lat="19.096888"><ele>8.85</ele><time>2024-07-23T04:18:57Z</time><extensions><speed>0.94</speed></extensions></trkpt>
    <trkpt lon="72.919676" lat="19.096883"><ele>8.89</ele><time>2024-07-23T04:18:58Z</time></trkpt>
    <trkpt lat="19.096870" lon="72.919660"><time>2024-07-23T04:18:59Z</time></trkpt>
    <trkpt lon="72.919650" lat="19.096860"><ele>9.0</ele></trkpt>
  </trkseg></trk>
</gpx>`;

describe("parseGpx", () => {
  it("extracts points with lat/lon/ele/epoch-ms time", () => {
    const pts = parseGpx(SAMPLE);
    expect(pts).toHaveLength(3); // 4th has no <time>, dropped
    expect(pts[0]).toEqual({
      lat: 19.096888,
      lon: 72.919684,
      ele: 8.85,
      t: Date.parse("2024-07-23T04:18:57Z"),
    });
    expect(pts[2]!.ele).toBe(0); // missing <ele> defaults to 0
  });

  it("handles attribute order variation and returns [] for garbage", () => {
    expect(parseGpx("not xml at all")).toEqual([]);
    const pts = parseGpx(SAMPLE);
    expect(pts[2]!.lat).toBe(19.09687); // lat-before-lon variant parsed
  });

  it("parses single-quoted attributes and skips self-closing points (no time)", () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lat='19.5' lon='72.8'><time>2024-07-23T04:20:00Z</time></trkpt>
      <trkpt lat="19.6" lon="72.9"/>
    </trkseg></trk></gpx>`;
    const pts = parseGpx(xml);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.lat).toBe(19.5);
  });

  it("skips timestamps without a timezone designator (determinism)", () => {
    const xml = `<gpx><trkpt lat="19.0" lon="72.9"><time>2024-07-23T04:20:00</time></trkpt>
      <trkpt lat="19.1" lon="72.9"><time>2024-07-23T04:21:00+05:30</time></trkpt></gpx>`;
    const pts = parseGpx(xml);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.t).toBe(Date.parse("2024-07-23T04:21:00+05:30"));
  });
});
