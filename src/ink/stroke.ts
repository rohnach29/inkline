import type { Rng } from "../storytell/rng";
import type { Pt } from "./types";

export interface StrokeOpts {
  /** outline max width in viewBox units (default 2.4) */
  width?: number;
  /** fraction (0.02–0.5) of stroke length tapering at each end (default 0.22) */
  taper?: number;
  /** max perpendicular displacement; engine clamps to 2.4 (default 1.1) */
  wobble?: number;
  /** units to extend past the final point — pen overshoot at corners (default 0) */
  overshoot?: number;
}

const WOBBLE_MAX = 2.4;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function resample(pts: readonly Pt[], step = 3): Pt[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const out: Pt[] = [{ ...pts[0]! }];
  let prev: Pt = pts[0]!;
  let need = step;
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!;
    let dx = cur.x - prev.x;
    let dy = cur.y - prev.y;
    let len = Math.hypot(dx, dy);
    while (len >= need) {
      const t = need / len;
      prev = { x: prev.x + dx * t, y: prev.y + dy * t };
      out.push({ ...prev });
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
      len = Math.hypot(dx, dy);
      need = step;
    }
    need -= len;
    prev = cur;
  }
  const last = pts[pts.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.5) out.push({ ...last });
  return out;
}

/** unit normals from neighbor differences */
function normals(pts: readonly Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
}

/** two slow incommensurate sines, phases/frequencies from the rng; endpoints
 *  pinned so strokes still meet where the skeleton says they meet */
function wobbled(pts: readonly Pt[], amp: number, rng: Rng): Pt[] {
  if (amp <= 0 || pts.length < 3) return pts.map((p) => ({ ...p }));
  const a = Math.min(amp, WOBBLE_MAX);
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;
  const f1 = 0.55 + rng.next() * 0.25;
  const f2 = 0.13 + rng.next() * 0.09;
  const ns = normals(pts);
  return pts.map((p, i) => {
    // 0.45+0.55 sine mix keeps |w| < a strictly under the 2.5 test bound
    const w = a * (0.45 * Math.sin(i * f1 + p1) + 0.55 * Math.sin(i * f2 + p2)) * 0.99;
    const pin = Math.min(1, i / 2, (pts.length - 1 - i) / 2);
    return { x: p.x + ns[i]!.x * w * pin, y: p.y + ns[i]!.y * w * pin };
  });
}

/** midpoint-quadratic smoothing (same idiom as render/svg.ts routes) */
function centerlineD(pts: readonly Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${r2(pts[0]!.x)},${r2(pts[0]!.y)}`;
  let d = `M${r2(pts[0]!.x)},${r2(pts[0]!.y)}`;
  if (pts.length === 2) return d + `L${r2(pts[1]!.x)},${r2(pts[1]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]!;
    const n = pts[i + 1]!;
    d += `Q${r2(c.x)},${r2(c.y)} ${r2((c.x + n.x) / 2)},${r2((c.y + n.y) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return d + `L${r2(last.x)},${r2(last.y)}`;
}

function outlineD(pts: readonly Pt[], width: number, taper: number): string {
  const ns = normals(pts);
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const ramp = Math.max(0.12, Math.min(1, t / taper, (1 - t) / taper));
    const hw = (width * ramp) / 2;
    left.push({ x: pts[i]!.x + ns[i]!.x * hw, y: pts[i]!.y + ns[i]!.y * hw });
    right.push({ x: pts[i]!.x - ns[i]!.x * hw, y: pts[i]!.y - ns[i]!.y * hw });
  }
  right.reverse();
  const seg = (ps: readonly Pt[]): string => ps.map((p) => `L${r2(p.x)},${r2(p.y)}`).join("");
  return `M${r2(left[0]!.x)},${r2(left[0]!.y)}${seg(left.slice(1))}${seg(right)}Z`;
}

export function strokePath(
  points: readonly Pt[],
  mode: "centerline" | "outline",
  opts: StrokeOpts,
  rng: Rng,
): string {
  let pts = resample(points);
  const over = opts.overshoot ?? 0;
  if (over > 0 && pts.length >= 2) {
    const a = pts[pts.length - 2]!;
    const b = pts[pts.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts.push({ x: b.x + ((b.x - a.x) / len) * over, y: b.y + ((b.y - a.y) / len) * over });
  }
  pts = wobbled(pts, opts.wobble ?? 1.1, rng);
  if (mode === "centerline") return centerlineD(pts);
  const taper = Math.min(0.5, Math.max(0.02, opts.taper ?? 0.22));
  return outlineD(pts, opts.width ?? 2.4, taper);
}
