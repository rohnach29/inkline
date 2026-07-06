import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { hatchFill, scribbleFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

/** BEAST — the hill: the hill-beast caught mid-YAWN, a great rounded head-hill
 *  filling the frame, eyes squeezed shut, mouth cranked open on a row of
 *  switchback teeth. The Kid stands bottom-right tipping a cap in greeting.
 *  Portrait: the beast is drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // the Kid, bottom-right, leaning forward in a doff — front hand lifts a cap in
  // greeting. Drawn before the beast. Faces left (flip) toward the yawning head.
  const kx = 208;
  const ky = 190;
  const ks = 0.55;
  const kfx = -1; // flipped
  strokes.push(...kidStrokes("dragging", { x: kx, y: ky, scale: ks, flip: true }, rng.fork("kid"), order));
  order += 40;
  // the cap, lifted off the head in the front (dragging) hand at local (18,-16)
  const hx = kx + 18 * ks * kfx;
  const hy = ky - 16 * ks;
  add(strokePath([{ x: hx - 7, y: hy + 1 }, { x: hx, y: hy - 5 }, { x: hx + 7, y: hy + 1 }], "centerline", { wobble: 0.3 }, rng.fork("capDome")), "centerline", "s-ink");
  add(strokePath([{ x: hx - 8, y: hy + 1 }, { x: hx + 10, y: hy - 1 }], "centerline", { wobble: 0.3 }, rng.fork("capBrim")), "centerline", "s-ink");

  // ---- THE BEAST (drawn last) ----
  // the great head-hill silhouette
  const dome: Pt[] = [
    { x: 18, y: 184 }, { x: 22, y: 138 }, { x: 34, y: 104 }, { x: 60, y: 78 },
    { x: 98, y: 64 }, { x: 142, y: 64 }, { x: 178, y: 76 }, { x: 204, y: 102 },
    { x: 216, y: 138 }, { x: 220, y: 184 },
  ];
  // faint hill-hatching along the lower flanks (leaves the face-centre clean)
  const leftFlank: Pt[] = [{ x: 18, y: 184 }, { x: 22, y: 138 }, { x: 34, y: 104 }, { x: 54, y: 132 }, { x: 60, y: 184 }];
  const rightFlank: Pt[] = [{ x: 182, y: 184 }, { x: 188, y: 130 }, { x: 204, y: 102 }, { x: 216, y: 138 }, { x: 220, y: 184 }];
  for (const d of hatchFill(leftFlank, 9, -0.6, rng.fork("hl"))) add(d, "centerline", "s-faint");
  for (const d of hatchFill(rightFlank, 9, -0.6, rng.fork("hr"))) add(d, "centerline", "s-faint");
  add(strokePath(dome, "centerline", { wobble: 0.6, overshoot: 2 }, rng.fork("dome")), "centerline", "s-ink");

  // squeezed-shut yawning eyes — arched, with raised scrunch-brows
  for (const ex of [84, 156]) {
    const ey = 104;
    add(strokePath([{ x: ex - 11, y: ey }, { x: ex - 4, y: ey - 7 }, { x: ex + 4, y: ey - 7 }, { x: ex + 11, y: ey }], "centerline", { wobble: 0.3 }, rng.fork(`eye:${ex}`)), "centerline", "s-ink");
    add(strokePath([{ x: ex - 12, y: ey - 11 }, { x: ex, y: ey - 15 }, { x: ex + 12, y: ey - 11 }], "centerline", { wobble: 0.3 }, rng.fork(`brow:${ex}`)), "centerline", "s-pencil");
    // one outer scrunch tick
    add(strokePath([{ x: ex + 13, y: ey - 2 }, { x: ex + 17, y: ey - 4 }], "centerline", { wobble: 0.2 }, rng.fork(`scr:${ex}`)), "centerline", "s-pencil");
  }
  // two nostrils above the yawn
  add(strokePath([{ x: 108, y: 126 }, { x: 111, y: 130 }], "centerline", { wobble: 0.2 }, rng.fork("n1")), "centerline", "s-ink");
  add(strokePath([{ x: 132, y: 126 }, { x: 129, y: 130 }], "centerline", { wobble: 0.2 }, rng.fork("n2")), "centerline", "s-ink");

  // the wide-open yawning mouth
  const mouth: Pt[] = Array.from({ length: 23 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    return { x: 120 + Math.cos(a) * 42, y: 150 + Math.sin(a) * 26 };
  });
  // dark cavern of the throat — faint scribble
  add(scribbleFill(mouth.map((p) => ({ x: 120 + (p.x - 120) * 0.78, y: 150 + (p.y - 150) * 0.78 })), 6, 0.3, rng.fork("throat")), "centerline", "s-faint");
  add(strokePath(mouth, "centerline", { wobble: 0.5 }, rng.fork("mouth")), "centerline", "s-ink");
  // switchback teeth — a hard zigzag row along the upper rim
  const upper: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    upper.push({ x: 82 + i * 9.5, y: i % 2 === 0 ? 138 : 150 });
  }
  add(strokePath(upper, "centerline", { wobble: 0.2 }, rng.fork("teethU")), "centerline", "s-ink");
  // a shorter zigzag along the lower rim
  const lower: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    lower.push({ x: 90 + i * 10, y: i % 2 === 0 ? 166 : 158 });
  }
  add(strokePath(lower, "centerline", { wobble: 0.2 }, rng.fork("teethL")), "centerline", "s-ink");
  // a small tongue curled at the back of the yawn
  add(strokePath([{ x: 108, y: 168 }, { x: 120, y: 172 }, { x: 132, y: 168 }], "centerline", { wobble: 0.3 }, rng.fork("tongue")), "centerline", "s-pencil");
  // yawn creases at the mouth corners
  add(strokePath([{ x: 78, y: 144 }, { x: 70, y: 140 }], "centerline", { wobble: 0.3 }, rng.fork("cr1")), "centerline", "s-pencil");
  add(strokePath([{ x: 162, y: 144 }, { x: 170, y: 140 }], "centerline", { wobble: 0.3 }, rng.fork("cr2")), "centerline", "s-pencil");
  return strokes;
};
