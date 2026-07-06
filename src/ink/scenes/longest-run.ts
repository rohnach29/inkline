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
  const cx = 190, cy = 116;

  // ground + the reel's little stand — all faint
  add(strokePath([{ x: 12, y: 186 }, { x: 232, y: 186 }], "centerline", { wobble: 0.5 }, rng.fork("ground")), "centerline", "s-faint");
  add(strokePath([{ x: cx - 12, y: cy }, { x: cx - 20, y: 186 }], "centerline", { wobble: 0.6 }, rng.fork("legL")), "centerline", "s-faint");
  add(strokePath([{ x: cx + 12, y: cy }, { x: cx + 20, y: 186 }], "centerline", { wobble: 0.6 }, rng.fork("legR")), "centerline", "s-faint");

  // the ribbon of road running from the Kid back to the reel's mouth
  const start = Math.PI * 0.75; // outer coil sits lower-left, facing the ribbon
  const mouth: Pt = { x: cx + Math.cos(start) * R, y: cy + Math.sin(start) * R };
  const topRail: Pt[] = [
    { x: 62, y: 150 }, { x: 104, y: 150 }, { x: 142, y: 146 }, { x: mouth.x - 3, y: mouth.y - 4 },
  ];
  const botRail: Pt[] = [
    { x: 62, y: 162 }, { x: 104, y: 163 }, { x: 142, y: 159 }, { x: mouth.x + 5, y: mouth.y + 6 },
  ];
  add(strokePath(topRail, "centerline", { wobble: 0.8 }, rng.fork("railT")), "centerline", "s-ink");
  add(strokePath(botRail, "centerline", { wobble: 0.8 }, rng.fork("railB")), "centerline", "s-ink");
  // road centre dashes
  add(strokePath([{ x: 84, y: 156 }, { x: 96, y: 156 }], "centerline", { wobble: 0.3 }, rng.fork("d1")), "centerline", "s-pencil");
  add(strokePath([{ x: 116, y: 155 }, { x: 128, y: 154 }], "centerline", { wobble: 0.3 }, rng.fork("d2")), "centerline", "s-pencil");

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

  // the Kid, running left, hauling the road off the reel behind him. Drawn last.
  strokes.push(...kidStrokes("running", { x: 58, y: 170, scale: 0.95, flip: true }, rng.fork("kid"), order));
  return strokes;
};
