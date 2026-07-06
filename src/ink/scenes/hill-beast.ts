import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { hatchFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the hill is a great sleeping beast: its back a hatched switchback trail, its
 *  head a clear unhatched face — snout bump, one shut eye — and the Kid tiny on
 *  the snout, planting a flag. Body bulk grows with elevation gain. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const gain = params.gainM ?? 200;
  const crest = clamp(150 - gain * 0.2, 56, 132); // smaller y = taller beast

  // BODY (hatched mass) — starts BEHIND the head at x=64 so the face stays clean
  const back: Pt[] = [
    { x: 64, y: 134 }, { x: 78, y: crest + 26 }, { x: 112, y: crest },
    { x: 154, y: crest + 20 }, { x: 194, y: 158 }, { x: 214, y: 176 },
  ];
  const body: Pt[] = [...back, { x: 214, y: 190 }, { x: 64, y: 190 }];
  for (const d of hatchFill(body, 8, -0.5, rng.fork("mass"))) add(d, "centerline", "s-faint");
  add(strokePath(back, "centerline", { wobble: 0.5 }, rng.fork("spine")), "centerline", "s-pencil");

  // HEAD (crisp, unhatched): forehead sloping down from the body, a dip at the
  // brow, then a clear rounded SNOUT BUMP protruding left, jaw closing underneath
  const head: Pt[] = [
    { x: 64, y: 134 },                 // joins the spine
    { x: 52, y: 130 }, { x: 40, y: 132 },   // forehead
    { x: 32, y: 138 },                 // brow dip
    { x: 22, y: 142 }, { x: 14, y: 150 },   // snout bump rising
    { x: 13, y: 160 }, { x: 19, y: 168 },   // rounded nose tip
    { x: 34, y: 173 }, { x: 52, y: 176 }, { x: 66, y: 178 },  // jaw
  ];
  add(strokePath(head, "centerline", { wobble: 0.6, overshoot: 2 }, rng.fork("head")), "centerline", "s-ink");
  // one closed eye — a short downward-curved line — with a brow line above
  add(strokePath([{ x: 38, y: 146 }, { x: 44, y: 150 }, { x: 50, y: 146 }], "centerline", { wobble: 0.3 }, rng.fork("eye")), "centerline", "s-ink");
  add(strokePath([{ x: 37, y: 141 }, { x: 50, y: 140 }], "centerline", { wobble: 0.3 }, rng.fork("brow")), "centerline", "s-ink");
  // nostril on the nose tip + a soft breath line under it
  add(strokePath([{ x: 17, y: 158 }, { x: 21, y: 160 }], "centerline", { wobble: 0.2 }, rng.fork("nostril")), "centerline", "s-ink");
  add(strokePath([{ x: 10, y: 166 }, { x: 15, y: 167 }], "centerline", { wobble: 0.3 }, rng.fork("breath")), "centerline", "s-pencil");
  // sleep Z's anchored just above the snout, drifting up-left
  add(strokePath([{ x: 14, y: 128 }, { x: 21, y: 128 }, { x: 14, y: 135 }, { x: 21, y: 135 }], "centerline", { wobble: 0.4 }, rng.fork("z1")), "centerline", "s-pencil");
  add(strokePath([{ x: 22, y: 114 }, { x: 28, y: 114 }, { x: 22, y: 120 }, { x: 28, y: 120 }], "centerline", { wobble: 0.4 }, rng.fork("z2")), "centerline", "s-pencil");

  // the switchback trail zigzagging up the back, cross-ticked like a mountain path
  const trail: Pt[] = [
    { x: 70, y: 150 }, { x: 104, y: crest + 40 }, { x: 80, y: crest + 32 },
    { x: 118, y: crest + 20 }, { x: 94, y: crest + 12 }, { x: 124, y: crest + 3 },
  ];
  add(strokePath(trail, "centerline", { wobble: 0.5 }, rng.fork("trail")), "centerline", "s-pencil");
  for (let i = 0; i + 1 < trail.length; i++) {
    const a = trail[i]!;
    const b = trail[i + 1]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    add(strokePath([{ x: mx - 2, y: my - 2 }, { x: mx + 2, y: my + 2 }], "centerline", { wobble: 0.2 }, rng.fork(`tick:${i}`)), "centerline", "s-pencil");
  }

  // the flag the Kid plants on the bridge of the snout (crisp)
  const fx = 33;
  const fbase = 139;
  add(strokePath([{ x: fx, y: fbase }, { x: fx, y: fbase - 20 }], "centerline", { wobble: 0.3 }, rng.fork("pole")), "centerline", "s-ink");
  add(strokePath([{ x: fx, y: fbase - 20 }, { x: fx + 13, y: fbase - 16.5 }, { x: fx, y: fbase - 13 }], "centerline", { wobble: 0.3 }, rng.fork("pennant")), "centerline", "s-ink");

  // the Kid, tiny, standing ON the snout bridge, leaning to drive the flag home.
  // Drawn last.
  strokes.push(...kidStrokes("dragging", { x: 22, y: 141, scale: 0.45 }, rng.fork("kid"), order));
  return strokes;
};
