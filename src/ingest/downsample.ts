import type { TrackPoint } from "./types";

/**
 * Douglas-Peucker simplification with tolerance in meters.
 * Uses a local planar approximation (fine for run-sized tracks).
 */
export function downsample(points: TrackPoint[], toleranceM = 8): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const cosLat = Math.cos((points[0]!.lat * Math.PI) / 180);
  const xs = points.map((p) => p.lon * 111_320 * cosLat);
  const ys = points.map((p) => p.lat * 110_540);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    const ax = xs[s]!, ay = ys[s]!, bx = xs[e]!, by = ys[e]!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = xs[i]!, py = ys[i]!;
      let d: number;
      // point-to-SEGMENT distance (t clamped), a deliberate variant of textbook DP point-to-line
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceM && idx !== -1) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
