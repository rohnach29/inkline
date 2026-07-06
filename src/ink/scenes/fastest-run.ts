import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the shoes bolt ahead like ponies; the Kid is airborne, holding the laces as
 *  reins. The gap widens as the pace drops (faster = further ahead). */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const pace = params.paceMinPerKm ?? 6.0;
  const gap = clamp((7.5 - pace) * 26 + 20, 20, 108); // faster pace → bigger lead
  const shoesX = 206;
  const kidX = shoesX - gap;

  // faint ground and a scatter of speed lines trailing the Kid
  add(strokePath([{ x: 12, y: 188 }, { x: 232, y: 188 }], "centerline", { wobble: 0.5 }, rng.fork("ground")), "centerline", "s-faint");
  add(strokePath([{ x: kidX - 46, y: 118 }, { x: kidX - 20, y: 118 }], "centerline", { wobble: 0.5 }, rng.fork("sp1")), "centerline", "s-pencil");
  add(strokePath([{ x: kidX - 52, y: 132 }, { x: kidX - 22, y: 132 }], "centerline", { wobble: 0.5 }, rng.fork("sp2")), "centerline", "s-pencil");
  add(strokePath([{ x: kidX - 44, y: 146 }, { x: kidX - 18, y: 146 }], "centerline", { wobble: 0.5 }, rng.fork("sp3")), "centerline", "s-pencil");

  // the two runaway shoes, galloping (crisp)
  const shoe = (hx: number, hy: number, tag: string): void => {
    add(strokePath([{ x: hx, y: hy }, { x: hx + 18, y: hy - 2 }], "outline", { width: 8, taper: 0.3, wobble: 0.8 }, rng.fork(`${tag}sole`)), "outline", "s-ink");
    // ankle opening + a jaunty lace hook
    add(strokePath([{ x: hx + 1, y: hy - 3 }, { x: hx + 5, y: hy - 7 }, { x: hx + 9, y: hy - 4 }], "centerline", { wobble: 0.5 }, rng.fork(`${tag}cuff`)), "centerline", "s-ink");
  };
  shoe(198, 150, "shoeA"); // lead shoe
  shoe(180, 158, "shoeB"); // trailing shoe

  // the reins (laces) running from the Kid's fists to each shoe
  add(strokePath([{ x: kidX + 12, y: 118 }, { x: (kidX + 210) / 2, y: 138 }, { x: 200, y: 148 }], "centerline", { wobble: 0.6 }, rng.fork("reinA")), "centerline", "s-ink");
  add(strokePath([{ x: kidX + 8, y: 123 }, { x: (kidX + 188) / 2, y: 146 }, { x: 183, y: 155 }], "centerline", { wobble: 0.6 }, rng.fork("reinB")), "centerline", "s-ink");

  // the Kid, airborne and leaning back on the reins. Drawn last.
  strokes.push(...kidStrokes("mid-air", { x: kidX, y: 150, scale: 0.95, lean: -7 }, rng.fork("kid"), order));
  return strokes;
};
