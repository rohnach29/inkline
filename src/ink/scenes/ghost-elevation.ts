import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the eeriest chapter: a translucent staircase floating up to nowhere, every
 *  stroke pencil-soft, the steps unmoored with gaps between them — and the Kid
 *  paused halfway, turned back to look at the reader. Steps grow with gain.
 *
 *  NOTE: this scene deliberately breaks the s-ink-Kid convention — the Kid is
 *  re-classed to `s-pencil` so it reads as translucent as the ghost stair. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"]): void => {
    strokes.push({ d, mode, cls: "s-pencil", order: order++ });
  };

  const steps = clamp(Math.round((params.gainM ?? 200) / 40), 5, 12);
  const start: Pt = { x: 30, y: 178 };
  const dx = 15;
  const dy = 12;
  const w = 26;
  const dep = 9;
  const rh = 8;
  const midStep = Math.floor(steps / 2);

  // the floating steps — each an isometric plate, disconnected from its neighbours
  for (let i = 0; i < steps; i++) {
    const bx = start.x + i * dx;
    const by = start.y - i * dy;
    const FL: Pt = { x: bx, y: by };
    const FR: Pt = { x: bx + w, y: by };
    const BR: Pt = { x: bx + w + dep, y: by - dep * 0.6 };
    const BL: Pt = { x: bx + dep, y: by - dep * 0.6 };
    add(strokePath([FL, FR, BR, BL, FL], "centerline", { wobble: 0.4 }, rng.fork(`t:${i}`)), "centerline");
    add(strokePath([FL, { x: bx, y: by + rh }, { x: bx + w, y: by + rh }, FR], "centerline", { wobble: 0.4 }, rng.fork(`r:${i}`)), "centerline");
    add(strokePath([FR, { x: bx + w + dep, y: by + rh - dep * 0.6 }], "centerline", { wobble: 0.3 }, rng.fork(`s:${i}`)), "centerline");
  }

  // the Kid, paused on the middle step, turned back toward the reader. Its
  // strokes are re-classed s-pencil so it fades into the ghost stair.
  const bx = start.x + midStep * dx;
  const by = start.y - midStep * dy;
  const kid = kidStrokes("looking-up", { x: bx + 9, y: by, scale: 0.8, flip: true }, rng.fork("kid"), order)
    .map((stroke): OrderedStroke => ({ ...stroke, cls: "s-pencil" }));
  strokes.push(...kid);
  return strokes;
};
