import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circle = (cx: number, cy: number, r: number, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** BEAST — the ghost: a politely floating sheet with a gentle, apologetic face
 *  and one hand raised in a small wave, wearing running shoes and caught
 *  mid-stride. The Kid runs alongside from the bottom-left. Portrait: the sheet
 *  fills the frame and is drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // motion streaks trailing behind the stride — faint, drawn first
  for (const [sy, x0] of [[150, 30], [162, 26], [174, 34]] as const) {
    add(strokePath([{ x: x0, y: sy }, { x: x0 + 26, y: sy }], "centerline", { wobble: 0.3 }, rng.fork(`streak:${sy}`)), "centerline", "s-pencil");
  }

  // the Kid, bottom-left, running alongside (same direction) the ghost.
  strokes.push(...kidStrokes("running", { x: 38, y: 188, scale: 0.55 }, rng.fork("kid"), order));
  order += 40;

  // ---- THE GHOST (drawn last) ----
  // the floating sheet: domed top, sides, and a scalloped hem
  const sheet: Pt[] = [
    { x: 62, y: 78 }, { x: 66, y: 52 }, { x: 84, y: 36 }, { x: 110, y: 28 },
    { x: 140, y: 30 }, { x: 164, y: 44 }, { x: 176, y: 68 }, { x: 180, y: 108 },
    { x: 178, y: 144 }, { x: 174, y: 160 },
    // scalloped hem, right to left
    { x: 162, y: 150 }, { x: 150, y: 162 }, { x: 138, y: 150 }, { x: 126, y: 162 },
    { x: 114, y: 150 }, { x: 102, y: 162 }, { x: 90, y: 150 }, { x: 78, y: 162 },
    { x: 68, y: 150 },
    // back up the left side
    { x: 60, y: 130 }, { x: 58, y: 100 }, { x: 62, y: 78 },
  ];
  add(strokePath(sheet, "centerline", { wobble: 0.6 }, rng.fork("sheet")), "centerline", "s-ink");
  // soft drape-folds, kept to the sides so they never cross the face
  add(strokePath([{ x: 76, y: 66 }, { x: 70, y: 110 }, { x: 72, y: 142 }], "centerline", { wobble: 0.5 }, rng.fork("fold")), "centerline", "s-faint");
  add(strokePath([{ x: 162, y: 70 }, { x: 168, y: 110 }, { x: 166, y: 142 }], "centerline", { wobble: 0.5 }, rng.fork("fold2")), "centerline", "s-faint");

  // one arm-bump raised in a polite little wave (right side, up high)
  add(strokePath([{ x: 176, y: 74 }, { x: 190, y: 62 }, { x: 196, y: 72 }, { x: 184, y: 84 }], "centerline", { wobble: 0.4 }, rng.fork("wave")), "centerline", "s-ink");

  // gentle, apologetic face
  add(strokePath(circle(104, 82, 5.5, 12), "outline", { width: 2.4, wobble: 0.3 }, rng.fork("eyeL")), "outline", "s-ink");
  add(strokePath(circle(140, 82, 5.5, 12), "outline", { width: 2.4, wobble: 0.3 }, rng.fork("eyeR")), "outline", "s-ink");
  // small raised, apologetic brows
  add(strokePath([{ x: 96, y: 72 }, { x: 108, y: 70 }], "centerline", { wobble: 0.2 }, rng.fork("browL")), "centerline", "s-pencil");
  add(strokePath([{ x: 132, y: 70 }, { x: 144, y: 72 }], "centerline", { wobble: 0.2 }, rng.fork("browR")), "centerline", "s-pencil");
  // a small, polite closed smile
  add(strokePath([{ x: 112, y: 100 }, { x: 122, y: 105 }, { x: 132, y: 100 }], "centerline", { wobble: 0.3 }, rng.fork("smile")), "centerline", "s-ink");

  // running shoes poking below the hem, mid-stride: front shoe planted, back
  // shoe lifted and toed-off behind
  // front (right) shoe
  const fx = 148;
  const fy = 176;
  add(strokePath([{ x: fx - 10, y: fy + 4 }, { x: fx + 12, y: fy + 3 }], "centerline", { wobble: 0.3 }, rng.fork("fSole")), "centerline", "s-ink");
  add(strokePath([{ x: fx - 10, y: fy + 4 }, { x: fx - 9, y: fy - 2 }, { x: fx - 2, y: fy - 4 }, { x: fx + 6, y: fy - 1 }, { x: fx + 12, y: fy + 3 }], "centerline", { wobble: 0.3 }, rng.fork("fUp")), "centerline", "s-ink");
  add(strokePath([{ x: fx - 6, y: fy }, { x: fx + 4, y: fy - 1 }], "centerline", { wobble: 0.2 }, rng.fork("fLace")), "centerline", "s-pencil");
  // back (left) shoe, lifted and tilted toe-down (mid-stride)
  const bx = 92;
  const by = 168;
  add(strokePath([{ x: bx - 10, y: by }, { x: bx + 11, y: by + 6 }], "centerline", { wobble: 0.3 }, rng.fork("bSole")), "centerline", "s-ink");
  add(strokePath([{ x: bx - 10, y: by }, { x: bx - 8, y: by - 5 }, { x: bx - 1, y: by - 6 }, { x: bx + 7, y: by - 1 }, { x: bx + 11, y: by + 6 }], "centerline", { wobble: 0.3 }, rng.fork("bUp")), "centerline", "s-ink");
  add(strokePath([{ x: bx - 5, y: by - 2 }, { x: bx + 5, y: by }], "centerline", { wobble: 0.2 }, rng.fork("bLace")), "centerline", "s-pencil");
  return strokes;
};
