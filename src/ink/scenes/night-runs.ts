import type { Rng } from "../../storytell/rng";
import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { scribbleFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid runs across the sky itself, hopping star to star */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // sleeping town silhouette along the bottom — faint
  const roofs: Pt[] = [
    { x: 10, y: 188 }, { x: 30, y: 176 }, { x: 44, y: 188 }, { x: 70, y: 188 },
    { x: 84, y: 170 }, { x: 100, y: 188 }, { x: 150, y: 188 }, { x: 166, y: 178 },
    { x: 182, y: 188 }, { x: 230, y: 188 },
  ];
  add(strokePath(roofs, "centerline", { wobble: 0.8 }, rng.fork("town")), "centerline", "s-faint");

  // stars as stepping stones arcing up-right; count from data
  const n = clamp(Math.round(params.count ?? 5), 3, 9);
  const stars: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    stars.push({ x: 26 + t * 180, y: 140 - Math.sin(t * Math.PI) * 60 - t * 14 });
  }
  for (const [i, s] of stars.entries()) {
    const r = 4 + rng.fork(`star:${i}`).next() * 2;
    add(strokePath([{ x: s.x - r, y: s.y }, { x: s.x + r, y: s.y }], "centerline", { wobble: 0.4 }, rng.fork(`sa:${i}`)), "centerline", "s-ink");
    add(strokePath([{ x: s.x, y: s.y - r }, { x: s.x, y: s.y + r }], "centerline", { wobble: 0.4 }, rng.fork(`sb:${i}`)), "centerline", "s-ink");
  }

  // faint dashed hop-arcs between consecutive stars
  for (let i = 0; i + 1 < stars.length; i++) {
    const a = stars[i]!;
    const b = stars[i + 1]!;
    const mid: Pt = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 14 };
    add(strokePath([a, mid, b], "centerline", { wobble: 0.5 }, rng.fork(`hop:${i}`)), "centerline", "s-pencil");
  }

  // a small moon watching, scribble-shaded
  add(strokePath(
    Array.from({ length: 15 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      return { x: 206 + Math.cos(a) * 13, y: 42 + Math.sin(a) * 13 };
    }),
    "centerline", { wobble: 0.9, overshoot: 3 }, rng.fork("moon")), "centerline", "s-ink");
  add(scribbleFill(
    Array.from({ length: 11 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return { x: 202 + Math.cos(a) * 8, y: 40 + Math.sin(a) * 8 };
    }),
    2.2, 0.6, rng.fork("moonshade")), "centerline", "s-faint");

  // the Kid, mid-hop off the middle star — drawn last
  const midStar = stars[Math.floor(stars.length / 2)]!;
  strokes.push(...kidStrokes("mid-air", { x: midStar.x + 8, y: midStar.y - 4, scale: 0.9 }, rng.fork("kid"), order));
  return strokes;
};
