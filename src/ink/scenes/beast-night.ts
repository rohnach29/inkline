import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circle = (cx: number, cy: number, r: number, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** BEAST — the night: a tall, long-armed creature made of streetlamp light and
 *  moths. A glowing lamp-head with a gentle, curious face; a gown of light
 *  flaring down; two very long arms sweeping toward the Kid, who offers a shoe
 *  up from the bottom-left. Portrait: the creature is drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // radiating light-rays from the lamp head — faint, drawn first
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 7 - 0.5) * Math.PI * 1.5;
    add(strokePath([{ x: 120 + Math.cos(a) * 16, y: 44 + Math.sin(a) * 16 }, { x: 120 + Math.cos(a) * 28, y: 44 + Math.sin(a) * 28 }], "centerline", { wobble: 0.3 }, rng.fork(`ray:${i}`)), "centerline", "s-faint");
  }
  // moths fluttering around the light — soft pencil "w" wings
  for (let i = 0; i < 7; i++) {
    const mx = 60 + rng.fork(`mx:${i}`).next() * 120;
    const my = 34 + rng.fork(`my:${i}`).next() * 92;
    add(strokePath([{ x: mx - 4, y: my - 2 }, { x: mx - 1, y: my + 1 }, { x: mx, y: my - 1 }, { x: mx + 1, y: my + 1 }, { x: mx + 4, y: my - 2 }], "centerline", { wobble: 0.3 }, rng.fork(`moth:${i}`)), "centerline", "s-pencil");
  }

  // the Kid, bottom-left, looking up and offering a shoe into the light.
  const kx = 50;
  const ky = 189;
  const ks = 0.55;
  strokes.push(...kidStrokes("looking-up", { x: kx, y: ky, scale: ks }, rng.fork("kid"), order));
  order += 40;
  // the offered shoe, held up in the front hand at local (9,-18)
  const sx = kx + 9 * ks + 2;
  const sy = ky - 18 * ks - 8;
  add(strokePath([{ x: sx - 7, y: sy + 3 }, { x: sx + 7, y: sy + 2 }], "centerline", { wobble: 0.3 }, rng.fork("shoeSole")), "centerline", "s-ink");
  add(strokePath([{ x: sx - 7, y: sy + 3 }, { x: sx - 6, y: sy - 2 }, { x: sx + 2, y: sy - 3 }, { x: sx + 7, y: sy - 0.5 }, { x: sx + 7, y: sy + 2 }], "centerline", { wobble: 0.3 }, rng.fork("shoeUp")), "centerline", "s-ink");
  add(strokePath([{ x: sx - 3, y: sy - 1 }, { x: sx + 4, y: sy - 1 }], "centerline", { wobble: 0.2 }, rng.fork("shoeLace")), "centerline", "s-pencil");

  // ---- THE CREATURE (drawn last) ----
  // gown of light: two long soft edges flaring from the head down and out
  add(strokePath([{ x: 110, y: 52 }, { x: 96, y: 96 }, { x: 78, y: 138 }, { x: 68, y: 168 }], "centerline", { wobble: 0.6 }, rng.fork("gownL")), "centerline", "s-faint");
  add(strokePath([{ x: 130, y: 52 }, { x: 144, y: 96 }, { x: 162, y: 138 }, { x: 172, y: 168 }], "centerline", { wobble: 0.6 }, rng.fork("gownR")), "centerline", "s-faint");
  // vertical light-threads inside the gown
  for (const gx of [104, 120, 136]) {
    add(strokePath([{ x: gx, y: 60 }, { x: gx + (gx - 120) * 0.5, y: 150 }], "centerline", { wobble: 0.4 }, rng.fork(`thread:${gx}`)), "centerline", "s-faint");
  }

  // the lamp head
  add(strokePath([{ x: 116, y: 30 }, { x: 124, y: 30 }], "centerline", { wobble: 0.2 }, rng.fork("cap")), "centerline", "s-ink");
  add(strokePath([{ x: 108, y: 34 }, { x: 132, y: 34 }, { x: 130, y: 54 }, { x: 110, y: 54 }, { x: 108, y: 34 }], "centerline", { wobble: 0.4 }, rng.fork("lamp")), "centerline", "s-ink");

  // gentle, curious face on the lamp
  for (const ex of [114, 126]) {
    add(strokePath(circle(ex, 42, 2.6, 10), "centerline", { wobble: 0.2 }, rng.fork(`eye:${ex}`)), "centerline", "s-ink");
    add(strokePath(circle(ex + 0.4, 42.4, 0.9, 6), "outline", { width: 2, wobble: 0.1 }, rng.fork(`pup:${ex}`)), "outline", "s-ink");
    add(strokePath([{ x: ex - 3, y: 37 }, { x: ex + 2, y: 36 }], "centerline", { wobble: 0.2 }, rng.fork(`brow:${ex}`)), "centerline", "s-pencil");
  }
  // a small soft "o" of a mouth — curious
  add(strokePath(circle(120, 49, 1.8, 8), "centerline", { wobble: 0.2 }, rng.fork("mouth")), "centerline", "s-ink");

  // the two long arms sweeping down toward the offered shoe
  add(strokePath([{ x: 108, y: 66 }, { x: 84, y: 100 }, { x: 70, y: 138 }, { x: 66, y: 166 }], "centerline", { wobble: 0.6 }, rng.fork("armL")), "centerline", "s-ink");
  add(strokePath([{ x: 132, y: 66 }, { x: 158, y: 100 }, { x: 170, y: 138 }, { x: 174, y: 166 }], "centerline", { wobble: 0.6 }, rng.fork("armR")), "centerline", "s-ink");
  // spindly fingers reaching for the shoe (left hand) and trailing (right hand)
  for (const [fx, fy, dir] of [[66, 166, -1], [174, 166, 1]] as const) {
    for (let k = -1; k <= 1; k++) {
      add(strokePath([{ x: fx, y: fy }, { x: fx + dir * 3 + k * 4, y: fy + 9 }], "centerline", { wobble: 0.3 }, rng.fork(`fin:${fx}:${k}`)), "centerline", "s-ink");
    }
  }
  return strokes;
};
