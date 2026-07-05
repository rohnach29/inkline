import type { TrackPoint } from "./types";

const EARTH_R = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;

export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export interface TrackStats {
  km: number;
  minutes: number;
  elevationGain: number;
}

export function trackStats(points: TrackPoint[]): TrackStats {
  if (points.length < 2) return { km: 0, minutes: 0, elevationGain: 0 };
  let meters = 0;
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    meters += haversineM(prev, cur);
    const dEle = cur.ele - prev.ele;
    if (dEle > 0) gain += dEle;
  }
  const minutes = (points[points.length - 1]!.t - points[0]!.t) / 60_000;
  return { km: meters / 1000, minutes, elevationGain: gain };
}
