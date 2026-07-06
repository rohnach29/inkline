import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid rides a paper plane bareback over a tiny round world, a dotted wake
 *  unspooling behind — the farther travelled, the longer the trail. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // the little round world: a shallow dome (top of a big circle) at the bottom
  const R = 210, ecx = 120, ecy = 372;
  const earth: Pt[] = [];
  for (let x = 22; x <= 218; x += 10) earth.push({ x, y: ecy - Math.sqrt(R * R - (x - ecx) * (x - ecx)) });
  add(strokePath(earth, "centerline", { wobble: 0.5 }, rng.fork("earth")), "centerline", "s-faint");
  // a few pin-trees standing on the curve — little closed triangles
  for (const tx of [58, 94, 150, 186]) {
    const ty = ecy - Math.sqrt(R * R - (tx - ecx) * (tx - ecx));
    add(strokePath([{ x: tx, y: ty }, { x: tx, y: ty - 6 }], "centerline", { wobble: 0.3 }, rng.fork(`trunk:${tx}`)), "centerline", "s-faint");
    add(strokePath([{ x: tx - 5, y: ty - 6 }, { x: tx, y: ty - 15 }, { x: tx + 5, y: ty - 6 }, { x: tx - 5, y: ty - 6 }], "centerline", { wobble: 0.3 }, rng.fork(`top:${tx}`)), "centerline", "s-faint");
  }

  // the dotted wake trailing down-left behind the plane; length grows with km
  const km = params.km ?? 12;
  const wn = clamp(Math.round(km * 0.7), 5, 24);
  for (let i = 0; i < wn; i++) {
    const t = i / wn;
    const wx = 148 - t * 128;
    const wy = 98 + t * t * 68;
    add(strokePath([{ x: wx, y: wy }, { x: wx - 1.7, y: wy + 1.7 }], "centerline", { wobble: 0.2 }, rng.fork(`wk:${i}`)), "centerline", "s-pencil");
  }

  // the paper plane — a folded dart, nose up-right (crisp)
  const nose: Pt = { x: 186, y: 74 };
  const backT: Pt = { x: 120, y: 70 };
  const notch: Pt = { x: 142, y: 92 };
  const backB: Pt = { x: 126, y: 110 };
  add(strokePath([nose, backT, notch], "centerline", { wobble: 0.4, overshoot: 2 }, rng.fork("wingT")), "centerline", "s-ink");
  add(strokePath([nose, backB, notch], "centerline", { wobble: 0.4, overshoot: 2 }, rng.fork("wingB")), "centerline", "s-ink");
  add(strokePath([nose, notch], "centerline", { wobble: 0.3 }, rng.fork("crease")), "centerline", "s-ink");
  add(strokePath([backT, notch, backB], "centerline", { wobble: 0.4 }, rng.fork("tail")), "centerline", "s-ink");

  // the Kid riding astride the plane's spine, arms out ahead. Drawn last.
  strokes.push(...kidStrokes("mid-air", { x: 150, y: 92, scale: 0.62 }, rng.fork("kid"), order));
  return strokes;
};
