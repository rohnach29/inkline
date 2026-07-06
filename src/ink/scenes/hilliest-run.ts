import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { hatchFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the hill is so steep it folds over at the crest; the Kid climbs up under the
 *  overhanging curl. Fold height scales with elevation gain. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const gain = params.gainM ?? 200;
  const ht = clamp(160 - gain * 0.25, 40, 120); // crest y — smaller = taller hill

  // the hill body: a steep mass peaking near x=150. Top contour is a function of
  // x (always a simple polygon), closed along the baseline.
  const top: Pt[] = [
    { x: 20, y: 188 }, { x: 50, y: 184 }, { x: 84, y: 168 }, { x: 114, y: 134 },
    { x: 136, y: ht + 18 }, { x: 150, y: ht }, { x: 164, y: ht + 18 },
    { x: 190, y: ht + (188 - ht) * 0.4 }, { x: 214, y: 176 }, { x: 232, y: 188 },
  ];
  const body: Pt[] = [...top, { x: 232, y: 190 }, { x: 20, y: 190 }];
  for (const d of hatchFill(body, 8, -0.5, rng.fork("mass"))) add(d, "centerline", "s-faint");
  add(strokePath(top, "centerline", { wobble: 0.4 }, rng.fork("ridge")), "centerline", "s-pencil");

  // the fold: a breaking-wave curl that rises off the crest, leans LEFT and
  // hooks under — the Kid clings to the steep wall beneath the overhang (crisp).
  const hook: Pt[] = [
    { x: 150, y: ht }, { x: 146, y: ht - 16 }, { x: 132, y: ht - 24 },
    { x: 114, y: ht - 20 }, { x: 104, y: ht - 6 }, { x: 110, y: ht + 8 }, { x: 124, y: ht + 6 },
  ];
  add(strokePath(hook, "centerline", { wobble: 0.8, overshoot: 2 }, rng.fork("fold")), "centerline", "s-ink");
  // a couple of strain lines under the overhang
  add(strokePath([{ x: 112, y: ht + 6 }, { x: 118, y: ht + 18 }], "centerline", { wobble: 0.5 }, rng.fork("strain1")), "centerline", "s-pencil");
  add(strokePath([{ x: 126, y: ht + 2 }, { x: 132, y: ht + 14 }], "centerline", { wobble: 0.5 }, rng.fork("strain2")), "centerline", "s-pencil");

  // the Kid, climbing the steep face right under the fold. Drawn last.
  const ky = clamp(ht + 56, 92, 176);
  strokes.push(...kidStrokes("climbing", { x: 118, y: ky, scale: 0.82 }, rng.fork("kid"), order));
  return strokes;
};
