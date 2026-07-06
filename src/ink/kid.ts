import type { Rng } from "../storytell/rng";
import { strokePath } from "./stroke";
import { scribbleFill } from "./fills";
import type { OrderedStroke, Pt } from "./types";

export type KidPose =
  | "running" | "collapsed" | "climbing" | "sleeping" | "looking-up" | "dragging" | "mid-air";

export interface KidOpts {
  /** feet anchor */
  x: number;
  y: number;
  scale?: number;
  flip?: boolean;
  /** forward lean in local x-units applied to the head (positive = forward) */
  lean?: number;
}

/** local-space skeleton per pose. All coordinates are in Kid space:
 *  origin at the feet anchor, +x forward (nose direction), −y up.
 *  Refine numbers freely in the visual gate; keep the joint names. */
interface KidSkeleton {
  head: Pt;                 // head center
  torso: [Pt, Pt];          // neck → hip
  armF: Pt[]; armB: Pt[];   // shoulder → hand (front/back arm)
  legF: Pt[]; legB: Pt[];   // hip → heel (front/back leg)
  footF: [Pt, Pt]; footB: [Pt, Pt]; // heel → toe (feet are LONG)
  eyeOpen: boolean;
}

const P = (x: number, y: number): Pt => ({ x, y });

const SKELETONS: Record<KidPose, KidSkeleton> = {
  running: {
    head: P(4, -37), torso: [P(4, -31), P(0, -16)],
    armF: [P(2, -27), P(10, -22), P(14, -27)], armB: [P(2, -27), P(-7, -24), P(-11, -18)],
    legF: [P(0, -16), P(8, -9), P(12, -2)], legB: [P(0, -16), P(-6, -8), P(-12, -4)],
    footF: [P(12, -2), P(21, -1)], footB: [P(-12, -4), P(-4, -6)],
    eyeOpen: true,
  },
  collapsed: {
    head: P(5, -18), torso: [P(2, -13), P(-3, -4)],
    armF: [P(1, -12), P(7, -8), P(12, -3)], armB: [P(1, -12), P(-6, -8), P(-9, -3)],
    legF: [P(-3, -4), P(6, -3), P(13, -2)], legB: [P(-3, -4), P(3, -5), P(9, -6)],
    footF: [P(13, -2), P(21, -3)], footB: [P(9, -6), P(17, -7)],
    eyeOpen: false,
  },
  climbing: {
    head: P(8, -40), torso: [P(4, -33), P(-2, -20)],
    armF: [P(3, -31), P(11, -37), P(16, -43)], armB: [P(3, -31), P(-3, -27), P(-6, -21)],
    legF: [P(-2, -20), P(6, -14), P(9, -7)], legB: [P(-2, -20), P(-8, -12), P(-9, -3)],
    footF: [P(9, -7), P(17, -5)], footB: [P(-9, -3), P(-1, -1)],
    eyeOpen: true,
  },
  sleeping: {
    head: P(-15, -6), torso: [P(-8, -6), P(8, -5)],
    armF: [P(-7, -6), P(-10, -8), P(-14, -7)], armB: [P(-7, -6), P(-11, -5), P(-15, -4)],
    legF: [P(8, -5), P(14, -9), P(21, -3)], legB: [P(8, -5), P(13, -5), P(19, -8)],
    footF: [P(21, -3), P(31, -2)], footB: [P(19, -8), P(28, -9)],
    eyeOpen: false,
  },
  "looking-up": {
    head: P(1, -39), torso: [P(0, -31), P(0, -16)],
    armF: [P(0, -28), P(6, -23), P(9, -18)], armB: [P(0, -28), P(-6, -23), P(-9, -18)],
    legF: [P(0, -16), P(3, -8), P(4, -1)], legB: [P(0, -16), P(-3, -8), P(-4, -1)],
    footF: [P(4, -1), P(13, 0)], footB: [P(-4, -1), P(4, -2)],
    eyeOpen: true,
  },
  dragging: {
    head: P(10, -34), torso: [P(6, -27), P(0, -14)],
    armF: [P(5, -25), P(13, -21), P(18, -16)], armB: [P(5, -25), P(-4, -22), P(-12, -18)],
    legF: [P(0, -14), P(7, -8), P(10, -1)], legB: [P(0, -14), P(-7, -7), P(-11, -1)],
    footF: [P(10, -1), P(19, 0)], footB: [P(-11, -1), P(-3, 0)],
    eyeOpen: true,
  },
  "mid-air": {
    head: P(8, -42), torso: [P(4, -34), P(0, -22)],
    armF: [P(3, -32), P(12, -30), P(17, -34)], armB: [P(3, -32), P(-6, -29), P(-10, -33)],
    legF: [P(0, -22), P(8, -18), P(11, -12)], legB: [P(0, -22), P(-7, -16), P(-6, -9)],
    footF: [P(11, -12), P(20, -10)], footB: [P(-6, -9), P(2, -8)],
    eyeOpen: true,
  },
};

/** rough circle as a polyline (for head outline + hair blob input) */
function circle(c: Pt, r: number, n = 14): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

export function kidStrokes(pose: KidPose, opts: KidOpts, rng: Rng, orderBase: number): OrderedStroke[] {
  const sk = SKELETONS[pose];
  const s = opts.scale ?? 1;
  const fx = opts.flip ? -1 : 1;
  const lean = opts.lean ?? 0;
  const T = (p: Pt): Pt => ({ x: opts.x + (p.x + (p.y / -46) * lean) * s * fx, y: opts.y + p.y * s });
  const Tall = (ps: readonly Pt[]): Pt[] => ps.map(T);

  const strokes: OrderedStroke[] = [];
  let order = orderBase;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };
  const limb = { width: 2.2 * s, wobble: 1.4, taper: 0.18 };

  // torso first, then limbs, feet, head, hair, nose, eye — face lands last
  add(strokePath(Tall(sk.torso), "outline", { width: 2.6 * s, wobble: 1.2 }, rng.fork("torso")), "outline", "s-ink");
  add(strokePath(Tall(sk.armB), "centerline", limb, rng.fork("armB")), "centerline", "s-ink");
  add(strokePath(Tall(sk.legB), "centerline", limb, rng.fork("legB")), "centerline", "s-ink");
  add(strokePath(Tall(sk.armF), "centerline", limb, rng.fork("armF")), "centerline", "s-ink");
  add(strokePath(Tall(sk.legF), "centerline", limb, rng.fork("legF")), "centerline", "s-ink");
  add(strokePath(Tall(sk.footB), "outline", { width: 3.4 * s, taper: 0.3, wobble: 0.8 }, rng.fork("footB")), "outline", "s-ink");
  add(strokePath(Tall(sk.footF), "outline", { width: 3.8 * s, taper: 0.3, wobble: 0.8 }, rng.fork("footF")), "outline", "s-ink");

  const headC = T(sk.head);
  const r = 8 * s;
  add(strokePath(circle(headC, r), "centerline", { wobble: 1.1, overshoot: 4 * s }, rng.fork("head")), "centerline", "s-ink");
  const hairBlob = circle({ x: headC.x - 4 * s * fx, y: headC.y - r * 0.95 }, r * 0.7, 10);
  add(scribbleFill(hairBlob, 1.6 * s, 0.5, rng.fork("hair")), "centerline", "s-ink");
  const noseY = headC.y + 1 * s;
  const nose: Pt[] = [
    { x: headC.x + r * 0.85 * fx, y: noseY - 2.5 * s },
    { x: headC.x + (r + 4 * s) * fx, y: noseY + 1 * s },
    { x: headC.x + r * 0.7 * fx, y: noseY + 3 * s },
  ];
  add(strokePath(nose, "centerline", { wobble: 0.7 }, rng.fork("nose")), "centerline", "s-ink");
  if (sk.eyeOpen) {
    add(strokePath(circle({ x: headC.x + r * 0.35 * fx, y: headC.y - 2 * s }, 0.9 * s, 6), "outline", { width: 1.6 * s, wobble: 0.2 }, rng.fork("eye")), "outline", "s-ink");
  } else {
    const ex = headC.x + r * 0.35 * fx;
    add(strokePath([{ x: ex - 2 * s, y: headC.y - 1.5 * s }, { x: ex + 2 * s, y: headC.y - 1.5 * s }], "centerline", { wobble: 0.3 }, rng.fork("eye")), "centerline", "s-ink");
  }
  return strokes;
}
