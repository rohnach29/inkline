import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid buried to the waist in torn-off calendar days, legs lost under the
 *  drift, arms still pumping — the drift deepens with the distance run. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // a torn calendar leaf: a small square with a ripped corner and a ruled line
  const leaf = (cx: number, cy: number, sz: number, rot: number, cls: OrderedStroke["cls"], key: string): void => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const T = (dx: number, dy: number): Pt => ({ x: cx + dx * c - dy * s, y: cy + dx * s + dy * c });
    const h = sz / 2;
    const outline = [T(-h, h), T(-h, -h), T(h * 0.35, -h), T(h, -h * 0.35), T(h, h), T(-h, h)];
    add(strokePath(outline, "centerline", { wobble: 0.5 }, rng.fork(`${key}o`)), "centerline", cls);
    add(strokePath([T(-h * 0.5, -h * 0.15), T(h * 0.5, -h * 0.15)], "centerline", { wobble: 0.3 }, rng.fork(`${key}l`)), "centerline", cls);
    add(strokePath([T(-h * 0.5, h * 0.35), T(h * 0.15, h * 0.35)], "centerline", { wobble: 0.3 }, rng.fork(`${key}m`)), "centerline", cls);
  };

  const km = params.km ?? 12;
  const leaves = clamp(Math.round(km), 10, 34);

  // ground
  add(strokePath([{ x: 10, y: 186 }, { x: 230, y: 186 }], "centerline", { wobble: 0.4 }, rng.fork("gnd")), "centerline", "s-faint");

  // BACK drift — leaves behind the Kid, faint
  const backN = Math.max(3, Math.round(leaves * 0.4));
  for (let i = 0; i < backN; i++) {
    const cx = 26 + rng.fork(`bx:${i}`).next() * 188;
    const cy = 150 + rng.fork(`by:${i}`).next() * 20;
    const sz = 10 + rng.fork(`bs:${i}`).next() * 6;
    const rot = (rng.fork(`br:${i}`).next() - 0.5) * 0.8;
    leaf(cx, cy, sz, rot, "s-faint", `bl:${i}`);
  }

  // the Kid, running, sunk to the waist (anchor below the drift surface). Drawn
  // now so the front drift can bury the legs on top.
  strokes.push(...kidStrokes("running", { x: 120, y: 188, scale: 0.95, lean: 3 }, rng.fork("kid"), order));
  order += 80;

  // FRONT drift — a bold ragged crest right at the waistline, then leaves piled
  // in front (crisp), cutting the Kid off cleanly
  const crest: Pt[] = Array.from({ length: 15 }, (_, i) => ({
    x: 18 + i * 15,
    y: 158 + Math.sin(i * 1.7) * 4 - rng.fork(`cr:${i}`).next() * 3,
  }));
  add(strokePath(crest, "centerline", { wobble: 0.8 }, rng.fork("crest")), "centerline", "s-ink");
  const frontN = leaves - backN;
  for (let i = 0; i < frontN; i++) {
    const cx = 22 + rng.fork(`fx:${i}`).next() * 192;
    const cy = 162 + rng.fork(`fy:${i}`).next() * 22;
    const sz = 11 + rng.fork(`fs:${i}`).next() * 7;
    const rot = (rng.fork(`fr:${i}`).next() - 0.5) * 0.9;
    const cls: OrderedStroke["cls"] = rng.fork(`fc:${i}`).next() > 0.5 ? "s-ink" : "s-pencil";
    leaf(cx, cy, sz, rot, cls, `fl:${i}`);
  }
  return strokes;
};
