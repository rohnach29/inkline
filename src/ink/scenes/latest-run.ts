import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** the Kid walks a leashed crescent moon like a dog; a streetlamp looks on */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // faint night ground + a few stars
  add(strokePath([{ x: 10, y: 186 }, { x: 232, y: 186 }], "centerline", { wobble: 0.5 }, rng.fork("ground")), "centerline", "s-faint");
  for (const [i, s] of ([{ x: 92, y: 40 }, { x: 150, y: 28 }, { x: 212, y: 48 }] as Pt[]).entries()) {
    add(strokePath([{ x: s.x - 3, y: s.y }, { x: s.x + 3, y: s.y }], "centerline", { wobble: 0.3 }, rng.fork(`sa:${i}`)), "centerline", "s-faint");
    add(strokePath([{ x: s.x, y: s.y - 3 }, { x: s.x, y: s.y + 3 }], "centerline", { wobble: 0.3 }, rng.fork(`sb:${i}`)), "centerline", "s-faint");
  }

  // the streetlamp on the left — post + gooseneck (faint), a crisp lit head that
  // is quietly watching (little pupil + brow)
  add(strokePath([{ x: 40, y: 184 }, { x: 40, y: 58 }], "centerline", { wobble: 0.6 }, rng.fork("post")), "centerline", "s-pencil");
  add(strokePath([{ x: 40, y: 58 }, { x: 46, y: 50 }, { x: 58, y: 52 }], "centerline", { wobble: 0.6 }, rng.fork("neck")), "centerline", "s-pencil");
  add(strokePath(arc(59, 58, 7, 0, Math.PI * 2, 14), "centerline", { wobble: 0.6 }, rng.fork("lamp")), "centerline", "s-ink");
  for (let i = 0; i < 3; i++) {
    const a = 0.4 + (i / 2) * 1.6;
    add(strokePath([{ x: 59 + Math.cos(a) * 9, y: 58 + Math.sin(a) * 9 }, { x: 59 + Math.cos(a) * 15, y: 58 + Math.sin(a) * 15 }], "centerline", { wobble: 0.3 }, rng.fork(`glow:${i}`)), "centerline", "s-faint");
  }
  add(strokePath(arc(62, 57, 1.2, 0, Math.PI * 2, 6), "centerline", { wobble: 0.2 }, rng.fork("pupil")), "centerline", "s-ink"); // watching
  add(strokePath([{ x: 58, y: 52 }, { x: 65, y: 51 }], "centerline", { wobble: 0.3 }, rng.fork("brow")), "centerline", "s-ink");

  // the crescent-moon "dog" trotting near the ground (crisp): outer bulge minus
  // an inner arc, with a collar and little trotting ticks
  const outer = arc(184, 168, 16, -1.05, 1.05, 8);
  const inner = arc(176, 168, 14, 1.05, -1.05, 8);
  add(strokePath([...outer, ...inner, outer[0]!], "centerline", { wobble: 0.7, overshoot: 2 }, rng.fork("moon")), "centerline", "s-ink");
  // a collar where the leash clips on, and two little trotting legs
  add(strokePath([{ x: 185, y: 154 }, { x: 195, y: 157 }], "centerline", { wobble: 0.3 }, rng.fork("collar")), "centerline", "s-ink");
  add(strokePath([{ x: 181, y: 183 }, { x: 179, y: 191 }], "centerline", { wobble: 0.3 }, rng.fork("leg1")), "centerline", "s-ink");
  add(strokePath([{ x: 193, y: 183 }, { x: 195, y: 191 }], "centerline", { wobble: 0.3 }, rng.fork("leg2")), "centerline", "s-ink");

  // the leash from the Kid's hand to the moon's collar
  add(strokePath([{ x: 133, y: 152 }, { x: 160, y: 152 }, { x: 189, y: 158 }], "centerline", { wobble: 0.5 }, rng.fork("leash")), "centerline", "s-ink");

  // the Kid, out for a walk. Drawn last.
  strokes.push(...kidStrokes("running", { x: 118, y: 178, scale: 0.95 }, rng.fork("kid"), order));
  return strokes;
};
