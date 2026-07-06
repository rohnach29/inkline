import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const circlePts = (cx: number, cy: number, r: number, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** the road spools up behind the Kid onto a giant reel; reel grows with km */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const km = params.km ?? 12;
  const R = clamp(km * 1.0 + 6, 12, 40); // reel radius scales with distance
  const cx = 190;
  const cy = 186 - R - 6; // reel rests low on its stand, just off the ground

  // ground + the reel's little stand — all faint
  add(strokePath([{ x: 12, y: 186 }, { x: 232, y: 186 }], "centerline", { wobble: 0.5 }, rng.fork("ground")), "centerline", "s-faint");
  add(strokePath([{ x: cx - 12, y: cy }, { x: cx - 20, y: 186 }], "centerline", { wobble: 0.6 }, rng.fork("legL")), "centerline", "s-faint");
  add(strokePath([{ x: cx + 12, y: cy }, { x: cx + 20, y: 186 }], "centerline", { wobble: 0.6 }, rng.fork("legR")), "centerline", "s-faint");

  // the ribbon of road: it lies flat on the ground behind the running Kid,
  // then peels up off the ground into the reel's mouth
  const start = Math.PI * 0.75; // outer coil ends lower-left, facing the ribbon
  const mouth: Pt = { x: cx + Math.cos(start) * R, y: cy + Math.sin(start) * R };
  const topRail: Pt[] = [
    { x: 78, y: 177 }, { x: 112, y: 174 }, { x: 146, y: 170 }, { x: mouth.x - 3, y: mouth.y - 4 },
  ];
  const botRail: Pt[] = [
    { x: 78, y: 186 }, { x: 116, y: 184 }, { x: 152, y: 180 }, { x: mouth.x + 5, y: mouth.y + 6 },
  ];
  add(strokePath(topRail, "centerline", { wobble: 0.8 }, rng.fork("railT")), "centerline", "s-ink");
  add(strokePath(botRail, "centerline", { wobble: 0.8 }, rng.fork("railB")), "centerline", "s-ink");
  // road centre dashes, on the flat stretch
  add(strokePath([{ x: 86, y: 181 }, { x: 96, y: 180.5 }], "centerline", { wobble: 0.3 }, rng.fork("d1")), "centerline", "s-pencil");
  add(strokePath([{ x: 118, y: 179 }, { x: 128, y: 178 }], "centerline", { wobble: 0.3 }, rng.fork("d2")), "centerline", "s-pencil");

  // the reel itself: an Archimedean spiral of coiled road (crisp)
  const spiral: Pt[] = [];
  const turns = 3;
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const r = 2 + (R - 2) * (1 - t);
    const a = start + t * turns * Math.PI * 2;
    spiral.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  add(strokePath(spiral, "centerline", { wobble: 0.6 }, rng.fork("spiral")), "centerline", "s-ink");
  add(strokePath(circlePts(cx, cy, 3, 8), "centerline", { wobble: 0.3 }, rng.fork("axle")), "centerline", "s-ink");

  // the Kid, UPRIGHT and running left along the ground, the road unspooling
  // off the reel behind him at heel level. Drawn last.
  strokes.push(...kidStrokes("running", { x: 52, y: 184, scale: 0.95, flip: true }, rng.fork("kid"), order));
  return strokes;
};
