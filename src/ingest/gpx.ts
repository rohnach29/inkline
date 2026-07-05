import type { TrackPoint } from "./types";

const TRKPT_RE = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const HAS_TZ_RE = /(Z|[+-]\d{2}:?\d{2})$/;

function numAttr(attrs: string, name: string): number | null {
  const m = attrs.match(new RegExp(`\\b${name}=["'](-?[\\d.]+)["']`));
  return m ? parseFloat(m[1]!) : null;
}

export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const m of xml.matchAll(TRKPT_RE)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? ""; // self-closing points have no body → no <time> → skipped
    const lat = numAttr(attrs, "lat");
    const lon = numAttr(attrs, "lon");
    const time = body.match(/<time>([^<]+)<\/time>/);
    if (lat === null || lon === null || !time) continue;
    if (!HAS_TZ_RE.test(time[1]!.trim())) continue; // no tz designator → local-time parse → nondeterministic
    const t = Date.parse(time[1]!);
    if (Number.isNaN(t)) continue;
    const ele = body.match(/<ele>(-?[\d.eE+]+)<\/ele>/);
    points.push({ lat, lon, ele: ele ? parseFloat(ele[1]!) : 0, t });
  }
  return points;
}
