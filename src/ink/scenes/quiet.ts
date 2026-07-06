import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the book's quiet heart: the Kid asleep in an armchair made from the giant
 *  empty shoe — a tall heel-counter for a back, the toe-cap for a rolled arm,
 *  laces drooping like armrest fringe. Dust motes and one cobweb thicken with
 *  the days of stillness. Tender, never grim. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // room: floor + a wall corner at the left (the cobweb's anchor)
  add(strokePath([{ x: 14, y: 184 }, { x: 228, y: 184 }], "centerline", { wobble: 0.5 }, rng.fork("floor")), "centerline", "s-faint");
  add(strokePath([{ x: 40, y: 22 }, { x: 40, y: 116 }], "centerline", { wobble: 0.4 }, rng.fork("wall")), "centerline", "s-faint");

  // one cobweb slung from the corner down to the chair back — soft threads
  add(strokePath([{ x: 40, y: 34 }, { x: 78, y: 100 }], "centerline", { wobble: 0.3 }, rng.fork("web0")), "centerline", "s-faint");
  add(strokePath([{ x: 40, y: 34 }, { x: 44, y: 62 }, { x: 56, y: 84 }], "centerline", { wobble: 0.4 }, rng.fork("web1")), "centerline", "s-faint");
  add(strokePath([{ x: 42, y: 46 }, { x: 51, y: 56 }, { x: 54, y: 64 }], "centerline", { wobble: 0.3 }, rng.fork("web2")), "centerline", "s-faint");
  add(strokePath([{ x: 46, y: 62 }, { x: 57, y: 72 }, { x: 64, y: 82 }], "centerline", { wobble: 0.3 }, rng.fork("web3")), "centerline", "s-faint");

  // BACK of the shoe-armchair (behind the Kid): the tall heel-counter backrest,
  // rounded and curling forward at the top
  add(strokePath([{ x: 64, y: 178 }, { x: 55, y: 152 }, { x: 53, y: 124 }, { x: 60, y: 106 }, { x: 76, y: 98 }, { x: 92, y: 102 }, { x: 102, y: 116 }], "centerline", { wobble: 0.7, overshoot: 2 }, rng.fork("backrest")), "centerline", "s-ink");

  // the Kid, curled asleep in the shoe's hollow — head lolled against the heel,
  // fully in view. Drawn before the seat rim so the rim reads as the shoe's edge.
  strokes.push(...kidStrokes("sleeping", { x: 118, y: 150, scale: 0.97 }, rng.fork("kid"), order));
  order += 40;

  // FRONT of the shoe-armchair: sole/rockers, the seat rim the Kid rests on, the
  // rolled toe-cap arm
  add(strokePath([{ x: 60, y: 178 }, { x: 108, y: 184 }, { x: 168, y: 183 }, { x: 200, y: 174 }], "centerline", { wobble: 0.6 }, rng.fork("sole")), "centerline", "s-ink");
  add(strokePath([{ x: 60, y: 178 }, { x: 54, y: 170 }, { x: 61, y: 165 }], "centerline", { wobble: 0.4 }, rng.fork("heel")), "centerline", "s-ink");
  // seat rim: a low front lip the Kid rests in, not crossing the body
  add(strokePath([{ x: 108, y: 154 }, { x: 136, y: 159 }, { x: 160, y: 156 }, { x: 178, y: 147 }], "centerline", { wobble: 0.6 }, rng.fork("seat")), "centerline", "s-ink");
  // the rolled toe-cap = the chair's front arm
  add(strokePath([{ x: 172, y: 146 }, { x: 190, y: 148 }, { x: 202, y: 158 }, { x: 202, y: 170 }, { x: 194, y: 178 }], "centerline", { wobble: 0.6, overshoot: 2 }, rng.fork("toe")), "centerline", "s-ink");
  add(strokePath([{ x: 188, y: 150 }, { x: 196, y: 160 }, { x: 192, y: 172 }], "centerline", { wobble: 0.4 }, rng.fork("toeseam")), "centerline", "s-ink");
  // eyelets + criss-cross laces on the vamp
  for (let i = 0; i < 3; i++) {
    const ex = 150 + i * 11;
    add(strokePath([{ x: ex, y: 144 }, { x: ex + 9, y: 152 }], "centerline", { wobble: 0.4 }, rng.fork(`x:${i}`)), "centerline", "s-ink");
  }
  // lace ends drooping over the front arm like fringe — soft pencil
  for (let i = 0; i < 3; i++) {
    const bx = 168 + i * 10;
    add(strokePath([{ x: bx, y: 150 }, { x: bx + 2, y: 162 }, { x: bx - 2, y: 172 }, { x: bx + 1, y: 180 }], "centerline", { wobble: 0.8 }, rng.fork(`fringe:${i}`)), "centerline", "s-pencil");
  }

  // dust motes as tiny + marks drifting in the light above; density grows with days
  const dust = clamp(Math.round(params.days ?? 8), 4, 20);
  for (let i = 0; i < dust; i++) {
    const mx = 92 + rng.fork(`dx:${i}`).next() * 120;
    const my = 38 + rng.fork(`dy:${i}`).next() * 74;
    const s = 1.3 + rng.fork(`ds:${i}`).next() * 1.1;
    add(strokePath([{ x: mx - s, y: my }, { x: mx + s, y: my }], "centerline", { wobble: 0.2 }, rng.fork(`da:${i}`)), "centerline", "s-pencil");
    add(strokePath([{ x: mx, y: my - s }, { x: mx, y: my + s }], "centerline", { wobble: 0.2 }, rng.fork(`db:${i}`)), "centerline", "s-pencil");
  }
  return strokes;
};
