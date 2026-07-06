import type { Rng } from "../storytell/rng";
import type { Pt } from "./types";

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** x-intervals where the horizontal line at `y` is inside `poly` (even-odd) */
function spans(poly: readonly Pt[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
  }
  xs.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

function rotate(p: Pt, ang: number): Pt {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** scanline rows of in-polygon segments, computed in a frame rotated by -angle */
function rows(
  blob: readonly Pt[],
  spacing: number,
  angle: number,
  rng: Rng,
  inset: number,
): Array<Array<[Pt, Pt]>> {
  const rot = blob.map((p) => rotate(p, -angle));
  const ys = rot.map((p) => p.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const out: Array<Array<[Pt, Pt]>> = [];
  for (let y = y0 + spacing / 2; y < y1; y += spacing * (0.8 + rng.next() * 0.4)) {
    const jy = y + (rng.next() - 0.5) * spacing * 0.2;
    const row: Array<[Pt, Pt]> = [];
    for (const [xa, xb] of spans(rot, jy)) {
      if (xb - xa < inset * 2) continue;
      row.push([rotate({ x: xa + inset, y: jy }, angle), rotate({ x: xb - inset, y: jy }, angle)]);
    }
    if (row.length > 0) out.push(row);
  }
  return out;
}

/** dense back-and-forth zigzag clipped to the blob — hair, shadow, fog */
export function scribbleFill(blob: readonly Pt[], spacing: number, angle: number, rng: Rng): string {
  const rs = rows(blob, spacing, angle, rng, 1.5);
  let d = "";
  let flip = false;
  for (const row of rs) {
    for (const [a, b] of row) {
      const from = flip ? b : a;
      const to = flip ? a : b;
      d += d === "" ? `M${r2(from.x)},${r2(from.y)}` : `L${r2(from.x)},${r2(from.y)}`;
      d += `L${r2(to.x)},${r2(to.y)}`;
      flip = !flip;
    }
  }
  return d;
}

/** parallel broken hatching — ground, hillsides */
export function hatchFill(blob: readonly Pt[], spacing: number, angle: number, rng: Rng): string[] {
  const rs = rows(blob, spacing, angle, rng, 1.5);
  const out: string[] = [];
  for (const row of rs) {
    for (const [a, b] of row) out.push(`M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}`);
  }
  return out;
}
