import type { TrackPoint } from "./types";

const TRKPT_RE = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;

export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const m of xml.matchAll(TRKPT_RE)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const lat = attrs.match(/\blat="(-?[\d.]+)"/);
    const lon = attrs.match(/\blon="(-?[\d.]+)"/);
    const time = body.match(/<time>([^<]+)<\/time>/);
    if (!lat || !lon || !time) continue;
    const t = Date.parse(time[1]!);
    if (Number.isNaN(t)) continue;
    const ele = body.match(/<ele>(-?[\d.eE+]+)<\/ele>/);
    points.push({
      lat: parseFloat(lat[1]!),
      lon: parseFloat(lon[1]!),
      ele: ele ? parseFloat(ele[1]!) : 0,
      t,
    });
  }
  return points;
}
