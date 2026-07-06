import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

/** the Kid runs off the top-right corner of a giant blank page into the void */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // the giant blank page, seen side-on as a cliff: a big rectangle on the left.
  // its TOP edge is the ledge the Kid runs along; its RIGHT edge is the drop.
  const L = 16, R = 150, T = 60, B = 182;

  // faint sides + bottom (the bulk of the sheet)
  add(strokePath([{ x: L, y: T }, { x: L, y: B }], "centerline", { wobble: 0.7 }, rng.fork("edgeL")), "centerline", "s-faint");
  add(strokePath([{ x: L, y: B }, { x: R, y: B }], "centerline", { wobble: 0.7 }, rng.fork("edgeB")), "centerline", "s-faint");
  // page thickness — a faint inner line hugging the two crisp edges (paper depth)
  add(strokePath([{ x: L + 5, y: T + 6 }, { x: R - 8, y: T + 6 }], "centerline", { wobble: 0.5 }, rng.fork("thickT")), "centerline", "s-faint");
  add(strokePath([{ x: R + 5, y: T + 8 }, { x: R + 5, y: B - 6 }], "centerline", { wobble: 0.5 }, rng.fork("thickR")), "centerline", "s-faint");
  // a soft fold crease across the blank — hints "paper" without writing on it
  add(strokePath([{ x: L + 24, y: T + 40 }, { x: L + 60, y: T + 30 }, { x: L + 96, y: T + 44 }], "centerline", { wobble: 0.9 }, rng.fork("fold")), "centerline", "s-faint");

  // the two CRISP edges the gag hangs on — the ledge and the drop
  add(strokePath([{ x: L, y: T }, { x: R, y: T }], "centerline", { wobble: 0.6 }, rng.fork("ledge")), "centerline", "s-ink");
  add(strokePath([{ x: R, y: T }, { x: R, y: B }], "centerline", { wobble: 0.6 }, rng.fork("drop")), "centerline", "s-ink");

  // a curled corner peeling up at the top-LEFT (clear of the Kid), so the big
  // rectangle reads as a sheet of paper rather than a box
  const curl: Pt[] = [
    { x: L + 2, y: T }, { x: L - 6, y: T - 6 }, { x: L - 12, y: T - 1 },
    { x: L - 9, y: T + 7 }, { x: L - 1, y: T + 8 },
  ];
  add(strokePath(curl, "centerline", { wobble: 0.7 }, rng.fork("curl")), "centerline", "s-ink");

  // faint falling ticks trailing off the edge — the drop into blank space
  add(strokePath([{ x: R + 8, y: T + 18 }, { x: R + 7, y: T + 28 }], "centerline", { wobble: 0.5 }, rng.fork("tick1")), "centerline", "s-pencil");
  add(strokePath([{ x: R + 15, y: T + 40 }, { x: R + 13, y: T + 50 }], "centerline", { wobble: 0.5 }, rng.fork("tick2")), "centerline", "s-pencil");
  add(strokePath([{ x: R + 22, y: T + 62 }, { x: R + 20, y: T + 72 }], "centerline", { wobble: 0.5 }, rng.fork("tick3")), "centerline", "s-pencil");

  // the Kid, mid-stride off the top-right corner — back foot on the ledge,
  // front foot already out over nothing. Drawn last.
  strokes.push(...kidStrokes("running", { x: R, y: T, scale: 0.92 }, rng.fork("kid"), order));
  return strokes;
};
