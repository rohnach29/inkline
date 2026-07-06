import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid marches chest-out down a long road, one proud chalk X struck for every
 *  day of the streak — the marks shrinking away to the horizon. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const n = clamp(Math.round(params.days ?? 7), 3, 21);
  const near: Pt = { x: 86, y: 178 };
  const vp: Pt = { x: 214, y: 98 };

  // the road: two edges converging to the vanishing point (faint)
  add(strokePath([{ x: 14, y: 188 }, { x: vp.x, y: vp.y + 2 }], "centerline", { wobble: 0.4 }, rng.fork("road1")), "centerline", "s-faint");
  add(strokePath([{ x: 14, y: 152 }, { x: vp.x - 4, y: vp.y + 6 }], "centerline", { wobble: 0.4 }, rng.fork("road2")), "centerline", "s-faint");

  // the chalk X-marks marching to the horizon, shrinking with perspective (crisp)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = near.x + (vp.x - near.x) * t * 0.92;
    const y = near.y + (vp.y - near.y) * t * 0.92;
    const s = 8 * (1 - t * 0.82);
    add(strokePath([{ x: x - s, y: y - s }, { x: x + s, y: y + s }], "centerline", { wobble: 0.4 }, rng.fork(`xa:${i}`)), "centerline", "s-ink");
    add(strokePath([{ x: x + s, y: y - s }, { x: x - s, y: y + s }], "centerline", { wobble: 0.4 }, rng.fork(`xb:${i}`)), "centerline", "s-ink");
  }

  // the Kid at the head of the streak, chest thrown back proud, mid-march. Last.
  strokes.push(...kidStrokes("running", { x: 46, y: 182, scale: 1.0, lean: -6 }, rng.fork("kid"), order));
  return strokes;
};
