import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { hatchFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the hill is a great sleeping beast: its back a hatched switchback trail, one
 *  eye shut, and the Kid — tiny on its snout — plants a flag. Bulk grows with gain. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const gain = params.gainM ?? 200;
  const crest = clamp(150 - gain * 0.2, 56, 132); // smaller y = taller beast

  // beast body: snout low-left, humped back, tail low-right — hatched mass
  const back: Pt[] = [
    { x: 30, y: 170 }, { x: 42, y: 150 }, { x: 52, y: 150 },
    { x: 60, y: 138 }, { x: 84, y: crest + 30 }, { x: 120, y: crest },
    { x: 158, y: crest + 22 }, { x: 196, y: 158 }, { x: 216, y: 176 },
  ];
  const body: Pt[] = [...back, { x: 216, y: 190 }, { x: 30, y: 190 }];
  for (const d of hatchFill(body, 8, -0.5, rng.fork("mass"))) add(d, "centerline", "s-faint");
  add(strokePath(back, "centerline", { wobble: 0.5 }, rng.fork("spine")), "centerline", "s-pencil");

  // the sleeping head: rounded snout, shut eye, brow, nostril (crisp)
  add(strokePath([{ x: 30, y: 170 }, { x: 25, y: 158 }, { x: 31, y: 148 }, { x: 46, y: 146 }], "centerline", { wobble: 0.5, overshoot: 2 }, rng.fork("snout")), "centerline", "s-ink");
  add(strokePath([{ x: 43, y: 150 }, { x: 49, y: 152 }, { x: 55, y: 150 }], "centerline", { wobble: 0.3 }, rng.fork("eye")), "centerline", "s-ink");
  add(strokePath([{ x: 43, y: 147 }, { x: 55, y: 145 }], "centerline", { wobble: 0.3 }, rng.fork("brow")), "centerline", "s-ink");
  add(strokePath([{ x: 29, y: 162 }, { x: 32, y: 164 }], "centerline", { wobble: 0.2 }, rng.fork("nostril")), "centerline", "s-ink");
  // little sleep Z's rising off the head
  add(strokePath([{ x: 18, y: 138 }, { x: 25, y: 138 }, { x: 18, y: 145 }, { x: 25, y: 145 }], "centerline", { wobble: 0.4 }, rng.fork("z1")), "centerline", "s-pencil");
  add(strokePath([{ x: 27, y: 124 }, { x: 33, y: 124 }, { x: 27, y: 130 }, { x: 33, y: 130 }], "centerline", { wobble: 0.4 }, rng.fork("z2")), "centerline", "s-pencil");

  // the switchback trail zigzagging up the back, cross-ticked like a mountain path
  const trail: Pt[] = [
    { x: 62, y: 148 }, { x: 100, y: crest + 40 }, { x: 74, y: crest + 32 },
    { x: 114, y: crest + 20 }, { x: 90, y: crest + 12 }, { x: 122, y: crest + 3 },
  ];
  add(strokePath(trail, "centerline", { wobble: 0.5 }, rng.fork("trail")), "centerline", "s-pencil");
  for (let i = 0; i + 1 < trail.length; i++) {
    const a = trail[i]!;
    const b = trail[i + 1]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    add(strokePath([{ x: mx - 2, y: my - 2 }, { x: mx + 2, y: my + 2 }], "centerline", { wobble: 0.2 }, rng.fork(`tick:${i}`)), "centerline", "s-pencil");
  }

  // the flag the Kid plants on the snout (crisp)
  const fx = 72;
  const fbase = 142;
  add(strokePath([{ x: fx, y: fbase }, { x: fx, y: fbase - 24 }], "centerline", { wobble: 0.3 }, rng.fork("pole")), "centerline", "s-ink");
  add(strokePath([{ x: fx, y: fbase - 24 }, { x: fx + 15, y: fbase - 20 }, { x: fx, y: fbase - 15 }], "centerline", { wobble: 0.3 }, rng.fork("pennant")), "centerline", "s-ink");

  // the Kid, tiny, leaning to drive the flagpole home. Drawn last.
  strokes.push(...kidStrokes("dragging", { x: 56, y: 145, scale: 0.5 }, rng.fork("kid"), order));
  return strokes;
};
