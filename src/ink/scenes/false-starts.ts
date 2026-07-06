import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** rotated ellipse as a polyline */
const ellipse = (cx: number, cy: number, rx: number, ry: number, rot: number, n = 22): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) };
  });

/** the Kid collapsed and snared at the base of a boulder-sized shoelace knot;
 *  one shoe cast off nearby, its lace the culprit. The tangle grows with the
 *  false-start count. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const cnt = clamp(Math.round(params.count ?? 4), 2, 9);
  const R = clamp(26 + cnt * 4, 30, 56);

  // ground — faint
  add(strokePath([{ x: 12, y: 184 }, { x: 228, y: 184 }], "centerline", { wobble: 0.5 }, rng.fork("gnd")), "centerline", "s-faint");

  // the cast-off shoe lying on the ground at left, its lace snaking up to the knot
  const shoe: Pt[] = [{ x: 30, y: 180 }, { x: 36, y: 172 }, { x: 54, y: 170 }, { x: 72, y: 174 }, { x: 78, y: 180 }];
  add(strokePath(shoe, "centerline", { wobble: 0.6 }, rng.fork("shoe")), "centerline", "s-ink");
  add(strokePath([{ x: 52, y: 170 }, { x: 56, y: 180 }], "centerline", { wobble: 0.4 }, rng.fork("shoeheel")), "centerline", "s-faint");

  // the giant tangled knot, sitting on the ground centre-right — overlapping
  // rotated lace-loops read as a boulder of string
  const kx = 152;
  const ky = clamp(182 - R, 74, 152);
  const nLoops = clamp(4 + Math.round(cnt / 1.4), 4, 8);
  for (let i = 0; i < nLoops; i++) {
    const rot = (i / nLoops) * Math.PI + rng.fork(`kr:${i}`).next() * 0.35;
    const rx = R * (0.72 + rng.fork(`krx:${i}`).next() * 0.32);
    const ry = R * (0.44 + rng.fork(`kry:${i}`).next() * 0.3);
    const ox = (rng.fork(`kox:${i}`).next() - 0.5) * R * 0.4;
    const oy = (rng.fork(`koy:${i}`).next() - 0.5) * R * 0.4;
    add(strokePath(ellipse(kx + ox, ky + oy, rx, ry, rot), "centerline", { wobble: 0.8 }, rng.fork(`k:${i}`)), "centerline", "s-ink");
  }
  // the lace from the cast-off shoe feeding into the knot
  add(strokePath([{ x: 64, y: 171 }, { x: 100, y: 156 }, { x: kx - R * 0.7, y: ky + R * 0.35 }], "centerline", { wobble: 0.7 }, rng.fork("lace2")), "centerline", "s-ink");
  // an aglet end whipping off the top of the knot
  add(strokePath([{ x: kx + R * 0.5, y: ky - R * 0.3 }, { x: kx + R * 0.85, y: ky - R * 0.6 }, { x: kx + R * 0.95, y: ky - R * 0.35 }], "centerline", { wobble: 0.7, overshoot: 2 }, rng.fork("aglet")), "centerline", "s-ink");

  // the Kid collapsed at the base of the knot, half-swallowed, facing back toward
  // the shoe it lost. Drawn now; the snaring loops go on top (the gag demands it).
  strokes.push(...kidStrokes("collapsed", { x: 150, y: 183, scale: 0.92, flip: true }, rng.fork("kid"), order));
  order += 40;
  // a lace loop cinched round the Kid's torso, and one round the kicked-up foot,
  // both trailing back up into the knot
  add(strokePath(ellipse(150, 173, 15, 8, -0.15, 20), "centerline", { wobble: 0.6 }, rng.fork("snareBody")), "centerline", "s-ink");
  const foot: Pt = { x: 132, y: 180 };
  add(strokePath(ellipse(foot.x, foot.y - 2, 7, 4, -0.3, 16), "centerline", { wobble: 0.6 }, rng.fork("snareFoot")), "centerline", "s-ink");
  add(strokePath([{ x: 150, y: 166 }, { x: 156, y: 156 }, { x: kx - 4, y: ky + R * 0.45 }], "centerline", { wobble: 0.6 }, rng.fork("lace1")), "centerline", "s-ink");
  return strokes;
};
