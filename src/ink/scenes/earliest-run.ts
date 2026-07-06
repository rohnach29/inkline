import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circlePts = (cx: number, cy: number, r: number, n = 18): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** the Kid hauls the sleeping sun up over the horizon on a rope */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // horizon — faint
  add(strokePath([{ x: 10, y: 150 }, { x: 232, y: 150 }], "centerline", { wobble: 0.5 }, rng.fork("horizon")), "centerline", "s-faint");
  add(strokePath([{ x: 30, y: 158 }, { x: 96, y: 158 }], "centerline", { wobble: 0.4 }, rng.fork("gnd1")), "centerline", "s-faint");
  add(strokePath([{ x: 150, y: 160 }, { x: 224, y: 160 }], "centerline", { wobble: 0.4 }, rng.fork("gnd2")), "centerline", "s-faint");

  // the sun, half-risen over the horizon (crisp)
  const sx = 182, sy = 158, sr = 26;
  add(strokePath(circlePts(sx, sy, sr), "centerline", { wobble: 0.9, overshoot: 3 }, rng.fork("sun")), "centerline", "s-ink");
  // sleepy rays fanning off the top
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + 0.35 + (i / 5) * (Math.PI - 0.7);
    const p0: Pt = { x: sx + Math.cos(a) * (sr + 3), y: sy + Math.sin(a) * (sr + 3) };
    const p1: Pt = { x: sx + Math.cos(a) * (sr + 11), y: sy + Math.sin(a) * (sr + 11) };
    add(strokePath([p0, p1], "centerline", { wobble: 0.4 }, rng.fork(`ray:${i}`)), "centerline", "s-ink");
  }
  // sleeping face: two closed-eye arcs and a small snoozing mouth
  add(strokePath([{ x: sx - 12, y: sy - 4 }, { x: sx - 8, y: sy - 1 }, { x: sx - 4, y: sy - 4 }], "centerline", { wobble: 0.3 }, rng.fork("eyeL")), "centerline", "s-ink");
  add(strokePath([{ x: sx + 4, y: sy - 4 }, { x: sx + 8, y: sy - 1 }, { x: sx + 12, y: sy - 4 }], "centerline", { wobble: 0.3 }, rng.fork("eyeR")), "centerline", "s-ink");
  add(strokePath(circlePts(sx, sy + 7, 2.5, 8), "centerline", { wobble: 0.3 }, rng.fork("mouth")), "centerline", "s-ink");
  // little snores drifting up
  add(strokePath([{ x: sx + 18, y: sy - 22 }, { x: sx + 24, y: sy - 22 }, { x: sx + 18, y: sy - 16 }, { x: sx + 24, y: sy - 16 }], "centerline", { wobble: 0.4 }, rng.fork("z1")), "centerline", "s-pencil");
  add(strokePath([{ x: sx + 28, y: sy - 34 }, { x: sx + 33, y: sy - 34 }, { x: sx + 28, y: sy - 29 }, { x: sx + 33, y: sy - 29 }], "centerline", { wobble: 0.4 }, rng.fork("z2")), "centerline", "s-pencil");

  // the taut rope from the Kid's grip up to the sun
  add(strokePath([{ x: 76, y: 149 }, { x: 126, y: 150 }, { x: sx - sr + 4, y: sy - 10 }], "centerline", { wobble: 0.4 }, rng.fork("rope")), "centerline", "s-ink");

  // the Kid, leaning into the drag, hauling left. Drawn last.
  strokes.push(...kidStrokes("dragging", { x: 62, y: 172, scale: 0.95, flip: true }, rng.fork("kid"), order));
  return strokes;
};
