import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circlePts = (cx: number, cy: number, r: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** the Kid pushes an enormous door shut in the middle of the road, key in hand */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // the road runs up to the door and stops — two faint rails converging
  add(strokePath([{ x: 22, y: 190 }, { x: 92, y: 152 }], "centerline", { wobble: 0.8 }, rng.fork("railL")), "centerline", "s-faint");
  add(strokePath([{ x: 220, y: 190 }, { x: 150, y: 152 }], "centerline", { wobble: 0.8 }, rng.fork("railR")), "centerline", "s-faint");
  // faint centre dashes on the road
  add(strokePath([{ x: 121, y: 188 }, { x: 121, y: 178 }], "centerline", { wobble: 0.4 }, rng.fork("dash1")), "centerline", "s-pencil");
  add(strokePath([{ x: 121, y: 170 }, { x: 121, y: 162 }], "centerline", { wobble: 0.4 }, rng.fork("dash2")), "centerline", "s-pencil");

  // the enormous door frame standing on the road (crisp)
  const dl = 92, dr = 150, dt = 34, db = 152;
  add(strokePath([{ x: dl, y: db }, { x: dl, y: dt }, { x: dr, y: dt }, { x: dr, y: db }],
    "centerline", { wobble: 0.5 }, rng.fork("frame")), "centerline", "s-ink");
  // door slightly ajar: the near leaf swung a hair toward us at the top
  add(strokePath([{ x: dl, y: dt }, { x: dl + 10, y: dt - 5 }, { x: dr + 6, y: dt - 3 }],
    "centerline", { wobble: 0.5 }, rng.fork("ajar")), "centerline", "s-ink");
  add(strokePath([{ x: dr, y: dt }, { x: dr + 6, y: dt - 3 }], "centerline", { wobble: 0.4 }, rng.fork("ajarE")), "centerline", "s-ink");
  // two recessed panels
  add(strokePath([{ x: dl + 8, y: dt + 10 }, { x: dr - 8, y: dt + 10 }, { x: dr - 8, y: 82 }, { x: dl + 8, y: 82 }, { x: dl + 8, y: dt + 10 }],
    "centerline", { wobble: 0.4 }, rng.fork("panelT")), "centerline", "s-ink");
  add(strokePath([{ x: dl + 8, y: 92 }, { x: dr - 8, y: 92 }, { x: dr - 8, y: db - 12 }, { x: dl + 8, y: db - 12 }, { x: dl + 8, y: 92 }],
    "centerline", { wobble: 0.4 }, rng.fork("panelB")), "centerline", "s-ink");
  // doorknob + keyhole (it locks behind him)
  add(strokePath(circlePts(dr - 12, 92, 4, 10), "centerline", { wobble: 0.4 }, rng.fork("knob")), "centerline", "s-ink");
  add(strokePath(circlePts(dr - 12, 108, 2, 8), "centerline", { wobble: 0.3 }, rng.fork("keyhole")), "centerline", "s-ink");
  add(strokePath([{ x: dr - 12, y: 110 }, { x: dr - 12, y: 114 }], "centerline", { wobble: 0.3 }, rng.fork("keyslot")), "centerline", "s-ink");

  // the Kid, flipped, leans in from the right and pushes it shut, hand at the
  // door. Drawn last but for the key, which the pushing hand holds against it.
  const kx = 166, ky = 150;
  strokes.push(...kidStrokes("dragging", { x: kx, y: ky, scale: 0.95, flip: true }, rng.fork("kid"), order));
  order += 40; // keep the key above the Kid's front hand

  // the big brass key held in the leading hand, tipped toward the door
  const hx = kx - 18, hy = ky - 17;
  add(strokePath(circlePts(hx + 8, hy - 4, 4, 9), "centerline", { wobble: 0.4 }, rng.fork("keyBow")), "centerline", "s-ink");
  add(strokePath([{ x: hx + 4, y: hy - 1 }, { x: hx - 11, y: hy + 4 }], "centerline", { wobble: 0.3 }, rng.fork("keyShaft")), "centerline", "s-ink");
  add(strokePath([{ x: hx - 11, y: hy + 4 }, { x: hx - 11, y: hy + 9 }], "centerline", { wobble: 0.3 }, rng.fork("keyTooth1")), "centerline", "s-ink");
  add(strokePath([{ x: hx - 7, y: hy + 2 }, { x: hx - 7, y: hy + 7 }], "centerline", { wobble: 0.3 }, rng.fork("keyTooth2")), "centerline", "s-ink");
  return strokes;
};
