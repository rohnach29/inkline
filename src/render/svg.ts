import type { TrackPoint } from "../ingest";
import { downsample } from "../ingest";
import type { LatLonName } from "../storytell";
import { Rng, hashString } from "../storytell";

const MAX_ROUTE_POINTS = 220;
const INITIAL_TOLERANCE_M = 8;

export interface XY {
  x: number;
  y: number;
}

function minMax(values: readonly number[]): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of values) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}

/** Equirectangular local projection: lon scaled by cos(midLat), fit into
 *  (width×height) minus pad on all sides, aspect preserved, centered.
 *  Y inverted (north = up). <2 points → []. */
export function projectTrack(
  track: readonly TrackPoint[],
  width = 400,
  height = 300,
  pad = 24,
): XY[] {
  if (track.length < 2) return [];

  const lats = track.map((p) => p.lat);
  const [minLat, maxLat] = minMax(lats);
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const xs = track.map((p) => p.lon * cosLat);
  const ys = lats;

  const [minX, maxX] = minMax(xs);
  const [minY, maxY] = minMax(ys);
  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  const drawW = width - 2 * pad;
  const drawH = height - 2 * pad;

  let scale: number;
  if (rangeX > 0 && rangeY > 0) {
    scale = Math.min(drawW / rangeX, drawH / rangeY);
  } else if (rangeX > 0) {
    scale = drawW / rangeX;
  } else if (rangeY > 0) {
    scale = drawH / rangeY;
  } else {
    scale = 1;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return xs.map((x, i) => ({
    x: width / 2 + (x - cx) * scale,
    y: height / 2 - (ys[i]! - cy) * scale,
  }));
}

function fmt1(n: number): string {
  return n.toFixed(1);
}

function xyStr(p: XY): string {
  return `${fmt1(p.x)},${fmt1(p.y)}`;
}

/** Deterministic hand-drawn path: jitter each point by Rng(hashString(seed))
 *  (dx, dy each in [-amp, +amp], amp default 1.6), then midpoint quadratic
 *  smoothing: M p0, then Q through each pair (control = original point,
 *  endpoint = midpoint of consecutive), ending L to last point.
 *  Coordinates rounded to 1 decimal in the d string. */
export function pathFrom(points: readonly XY[], seed: string, amp = 1.6): string {
  if (points.length === 0) return "";

  const rng = new Rng(hashString(seed));
  const jittered = points.map((p) => ({
    x: p.x + (rng.next() * 2 - 1) * amp,
    y: p.y + (rng.next() * 2 - 1) * amp,
  }));

  let d = `M ${xyStr(jittered[0]!)}`;
  for (let i = 1; i < jittered.length - 1; i++) {
    const cur = jittered[i]!;
    const next = jittered[i + 1]!;
    const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
    d += ` Q ${xyStr(cur)} ${xyStr(mid)}`;
  }
  if (jittered.length > 1) {
    d += ` L ${xyStr(jittered[jittered.length - 1]!)}`;
  }
  return d;
}

/** Complete inline <svg> for a run's route: viewBox "0 0 400 300",
 *  class "ink-map", single <path> with class "ink-route",
 *  filter="url(#wobble)", fill="none" (stroke via CSS).
 *  Track is downsampled first (ingest downsample, tolerance 8) if > 220 points,
 *  doubling tolerance until <= 220. Start marker: small circle at first point
 *  (class "ink-start"). Returns "" for < 2 usable points. */
export function routeSvg(track: readonly TrackPoint[], runId: string): string {
  let pts: readonly TrackPoint[] = track;

  if (track.length > MAX_ROUTE_POINTS) {
    let tolerance = INITIAL_TOLERANCE_M;
    let simplified = downsample(Array.from(track), tolerance);
    while (simplified.length > MAX_ROUTE_POINTS) {
      tolerance *= 2;
      simplified = downsample(Array.from(track), tolerance);
    }
    pts = simplified;
  }

  if (pts.length < 2) return "";

  const projected = projectTrack(pts);
  const d = pathFrom(projected, runId);
  const start = projected[0]!;

  return [
    `<svg viewBox="0 0 400 300" class="ink-map" xmlns="http://www.w3.org/2000/svg">`,
    `<path d="${d}" class="ink-route" filter="url(#wobble)" fill="none" />`,
    `<circle cx="${fmt1(start.x)}" cy="${fmt1(start.y)}" r="4" class="ink-start" />`,
    `</svg>`,
  ].join("");
}

const PACE_MIN_MIN_PER_KM = 3.5;
const PACE_MAX_MIN_PER_KM = 9.0;
const DRAW_MS_MIN = 2000;
const DRAW_MS_MAX = 6000;
const DRAW_MS_DEFAULT = 3500;

/** Maps a run's pace (minutes per km) to a self-drawing-ink duration in ms,
 *  linearly from [3.5 -> 2000] to [9.0 -> 6000], clamped to [2000, 6000].
 *  `null`, non-finite, or non-positive pace (no usable pace data) falls back
 *  to 3500ms. Always an integer. */
export function drawDurationMs(paceMinPerKm: number | null): number {
  if (paceMinPerKm === null || !Number.isFinite(paceMinPerKm) || paceMinPerKm <= 0) {
    return DRAW_MS_DEFAULT;
  }
  const t =
    (paceMinPerKm - PACE_MIN_MIN_PER_KM) / (PACE_MAX_MIN_PER_KM - PACE_MIN_MIN_PER_KM);
  const raw = DRAW_MS_MIN + t * (DRAW_MS_MAX - DRAW_MS_MIN);
  const clamped = Math.min(DRAW_MS_MAX, Math.max(DRAW_MS_MIN, raw));
  return Math.round(clamped);
}

function circularDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Manual comma-grouped integer formatting (no toLocaleString). */
function fmtCommaInt(n: number): string {
  const rounded = Math.round(n);
  const neg = rounded < 0;
  const digits = Math.abs(rounded).toString();
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
    out += digits[i];
  }
  return neg ? `-${out}` : out;
}

/** Hand-drawn flight page graphic: viewBox "0 0 400 300"; a globe (circle
 *  r≈110 centered 200,150 class "ink-globe") with 3 elliptical graticule
 *  arcs (class "ink-graticule"), from/to dots placed deterministically:
 *  angle around the globe rim derived from hashString(name) % 360 for each
 *  endpoint (re-derive if within 40° of each other: add 137° until apart),
 *  a dashed quadratic arc between them bowing outward (class "ink-arc"),
 *  handwriting labels (class "ink-label") with esc()'d names, and the
 *  distance "≈ N,NNN km" (integer, comma-grouped manually — no locale)
 *  as a label near the arc midpoint. */
export function flightSvg(from: LatLonName, to: LatLonName, km: number): string {
  const CX = 200;
  const CY = 150;
  const R = 110;

  const angleFrom = hashString(from.name) % 360;
  let angleTo = hashString(to.name) % 360;
  while (circularDiff(angleFrom, angleTo) < 40) {
    angleTo = (angleTo + 137) % 360;
  }

  const rad = (deg: number): number => (deg * Math.PI) / 180;
  const fromXY: XY = {
    x: CX + R * Math.cos(rad(angleFrom)),
    y: CY + R * Math.sin(rad(angleFrom)),
  };
  const toXY: XY = {
    x: CX + R * Math.cos(rad(angleTo)),
    y: CY + R * Math.sin(rad(angleTo)),
  };

  const midX = (fromXY.x + toXY.x) / 2;
  const midY = (fromXY.y + toXY.y) / 2;
  let dirX = midX - CX;
  let dirY = midY - CY;
  let len = Math.hypot(dirX, dirY);
  if (len === 0) {
    dirX = 0;
    dirY = -1;
    len = 1;
  }
  const bow = 60;
  const ctrl: XY = {
    x: midX + (dirX / len) * bow,
    y: midY + (dirY / len) * bow,
  };

  const arcPath = `M ${xyStr(fromXY)} Q ${xyStr(ctrl)} ${xyStr(toXY)}`;
  const distLabel = `≈ ${fmtCommaInt(km)} km`;

  return [
    `<svg viewBox="0 0 400 300" class="ink-flight" xmlns="http://www.w3.org/2000/svg">`,
    `<circle cx="${CX}" cy="${CY}" r="${R}" class="ink-globe" fill="none" />`,
    `<ellipse cx="${CX}" cy="${CY}" rx="40" ry="${R}" class="ink-graticule" fill="none" />`,
    `<ellipse cx="${CX}" cy="${CY}" rx="80" ry="${R}" class="ink-graticule" fill="none" />`,
    `<ellipse cx="${CX}" cy="${CY}" rx="${R}" ry="40" class="ink-graticule" fill="none" />`,
    `<path d="${arcPath}" class="ink-arc" fill="none" />`,
    `<circle cx="${fmt1(fromXY.x)}" cy="${fmt1(fromXY.y)}" r="4" class="ink-dot" />`,
    `<circle cx="${fmt1(toXY.x)}" cy="${fmt1(toXY.y)}" r="4" class="ink-dot" />`,
    `<text x="${fmt1(fromXY.x)}" y="${fmt1(fromXY.y - 8)}" class="ink-label">${esc(from.name)}</text>`,
    `<text x="${fmt1(toXY.x)}" y="${fmt1(toXY.y - 8)}" class="ink-label">${esc(to.name)}</text>`,
    `<text x="${fmt1(ctrl.x)}" y="${fmt1(ctrl.y)}" class="ink-label">${distLabel}</text>`,
    `</svg>`,
  ].join("");
}

/** HTML-escape &, <, >, ", ' */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
