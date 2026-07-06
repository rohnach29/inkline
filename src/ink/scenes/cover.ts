import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

/** COVER — the Kid runs along the book's own title rule-line as if it were
 *  pavement: one long horizontal line, the Kid running on top of it, a few speed
 *  dashes trailing behind, and one leaf tumbling loose. The Kid is drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const RULE_Y = 150;

  // the title rule-line, doubling as pavement — one long crisp horizontal
  add(strokePath([{ x: 16, y: RULE_Y }, { x: 224, y: RULE_Y }], "centerline", { wobble: 0.4 }, rng.fork("rule")), "centerline", "s-ink");
  // a few pavement seams hanging off the underside of the line
  for (const sx of [56, 108, 168, 208]) {
    add(strokePath([{ x: sx, y: RULE_Y + 1 }, { x: sx, y: RULE_Y + 6 }], "centerline", { wobble: 0.2 }, rng.fork(`seam:${sx}`)), "centerline", "s-faint");
  }

  // speed dashes trailing behind the runner
  for (const [dy, x0, len] of [[128, 54, 22], [138, 46, 28], [146, 58, 18]] as const) {
    add(strokePath([{ x: x0, y: dy }, { x: x0 + len, y: dy }], "centerline", { wobble: 0.3 }, rng.fork(`dash:${dy}`)), "centerline", "s-pencil");
  }

  // one leaf tumbling loose in the upper right
  const lx = 184;
  const ly = 74;
  const leaf: Pt[] = [
    { x: lx - 9, y: ly }, { x: lx - 3, y: ly - 7 }, { x: lx + 6, y: ly - 6 },
    { x: lx + 9, y: ly + 2 }, { x: lx + 2, y: ly + 8 }, { x: lx - 7, y: ly + 5 },
    { x: lx - 9, y: ly },
  ];
  add(strokePath(leaf, "centerline", { wobble: 0.4 }, rng.fork("leaf")), "centerline", "s-ink");
  add(strokePath([{ x: lx - 7, y: ly + 3 }, { x: lx + 7, y: ly - 3 }], "centerline", { wobble: 0.3 }, rng.fork("leafRib")), "centerline", "s-ink");
  add(strokePath([{ x: lx + 7, y: ly - 3 }, { x: lx + 12, y: ly - 8 }], "centerline", { wobble: 0.3 }, rng.fork("leafStem")), "centerline", "s-pencil");
  // a curl of tumble-motion behind the leaf
  add(strokePath([{ x: lx + 16, y: ly + 2 }, { x: lx + 22, y: ly - 4 }, { x: lx + 18, y: ly - 10 }], "centerline", { wobble: 0.4 }, rng.fork("tumble")), "centerline", "s-pencil");

  // the Kid, running along the rule-line — feet on the line. Drawn LAST.
  strokes.push(...kidStrokes("running", { x: 118, y: RULE_Y, scale: 0.95 }, rng.fork("kid"), order));
  return strokes;
};
