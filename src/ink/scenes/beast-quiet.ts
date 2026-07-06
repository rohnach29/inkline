import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circle = (cx: number, cy: number, r: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** BEAST — the quiet: a huge soft blob with heavy-lidded, half-shut eyes,
 *  serenely absorbing an armchair into its right flank. The Kid peeks up from
 *  the bottom-left frame edge. Portrait: the blob fills the frame, drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // floor line — faint
  add(strokePath([{ x: 14, y: 186 }, { x: 226, y: 186 }], "centerline", { wobble: 0.4 }, rng.fork("floor")), "centerline", "s-faint");

  // the armchair being absorbed into the blob's right flank: a clear wingback
  // chair whose rolled left arm dissolves into the mass, the rest poking out
  // lower-right. Drawn before the blob so the blob swallows its top-left.
  add(strokePath([{ x: 194, y: 168 }, { x: 191, y: 138 }, { x: 199, y: 126 }, { x: 214, y: 126 }, { x: 224, y: 138 }, { x: 224, y: 168 }], "centerline", { wobble: 0.5 }, rng.fork("chBack")), "centerline", "s-ink");
  add(strokePath([{ x: 190, y: 168 }, { x: 226, y: 166 }], "centerline", { wobble: 0.3 }, rng.fork("chSeat")), "centerline", "s-ink");
  // rolled right arm (outer), and left arm sinking into the blob
  add(strokePath([{ x: 224, y: 150 }, { x: 226, y: 158 }, { x: 224, y: 166 }], "centerline", { wobble: 0.3 }, rng.fork("chArmR")), "centerline", "s-ink");
  add(strokePath([{ x: 194, y: 150 }, { x: 186, y: 152 }, { x: 184, y: 160 }, { x: 190, y: 166 }], "centerline", { wobble: 0.4 }, rng.fork("chArmL")), "centerline", "s-ink");
  // seat cushion crease + two front legs poking below the blob
  add(strokePath([{ x: 194, y: 158 }, { x: 224, y: 156 }], "centerline", { wobble: 0.3 }, rng.fork("chCush")), "centerline", "s-pencil");
  add(strokePath([{ x: 198, y: 166 }, { x: 197, y: 183 }], "centerline", { wobble: 0.3 }, rng.fork("chLegL")), "centerline", "s-ink");
  add(strokePath([{ x: 220, y: 166 }, { x: 221, y: 183 }], "centerline", { wobble: 0.3 }, rng.fork("chLegR")), "centerline", "s-ink");

  // the Kid, small, peeking up from the bottom-left frame edge (drawn before the
  // beast). Looking up at the looming quiet.
  strokes.push(...kidStrokes("looking-up", { x: 26, y: 188, scale: 0.55 }, rng.fork("kid"), order));
  order += 40;

  // ---- THE BEAST (drawn last) ----
  // a huge lumpy soft blob, center-right
  const cx = 126;
  const cy = 104;
  const rx = 92;
  const ry = 66;
  const blob: Pt[] = Array.from({ length: 33 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const rr = 1 + 0.055 * Math.sin(3 * a + 0.5) + 0.045 * Math.sin(5 * a + 1.2);
    return { x: cx + Math.cos(a) * rx * rr, y: cy + Math.sin(a) * ry * rr };
  });
  // the outline — soft, lumpy, no hard shading so it stays cloud-soft
  add(strokePath(blob, "centerline", { wobble: 0.9 }, rng.fork("hull")), "centerline", "s-ink");
  // one faint inner echo at the top-left to imply a soft, rounded volume
  add(strokePath([{ x: 62, y: 96 }, { x: 78, y: 66 }, { x: 106, y: 52 }], "centerline", { wobble: 0.6 }, rng.fork("sheen")), "centerline", "s-faint");

  // heavy-lidded eyes, high on the blob — droopy, only a sliver open
  for (const ex of [102, 152]) {
    const ey = 86;
    // the heavy upper lid — a low, near-flat droop
    add(strokePath([{ x: ex - 13, y: ey - 1 }, { x: ex - 3, y: ey - 2.5 }, { x: ex + 7, y: ey - 2 }, { x: ex + 13, y: ey }], "centerline", { wobble: 0.3 }, rng.fork(`lid:${ex}`)), "centerline", "s-ink");
    // the lower lid — a shallow arc right beneath, a sleepy sliver of eye
    add(strokePath([{ x: ex - 8, y: ey + 2 }, { x: ex, y: ey + 3 }, { x: ex + 8, y: ey + 2 }], "centerline", { wobble: 0.3 }, rng.fork(`low:${ex}`)), "centerline", "s-ink");
    // the pupil, a small dot sunk low under the lid
    add(strokePath(circle(ex, ey + 1.2, 1.5, 8), "outline", { width: 3, wobble: 0.2 }, rng.fork(`pup:${ex}`)), "outline", "s-ink");
    // a soft under-eye bag — the weight of great sleepiness
    add(strokePath([{ x: ex - 7, y: ey + 6 }, { x: ex, y: ey + 7 }, { x: ex + 7, y: ey + 6 }], "centerline", { wobble: 0.3 }, rng.fork(`bag:${ex}`)), "centerline", "s-pencil");
  }

  // a small, content, sleepy smile
  add(strokePath([{ x: 111, y: 118 }, { x: 121, y: 124 }, { x: 133, y: 124 }, { x: 143, y: 118 }], "centerline", { wobble: 0.4 }, rng.fork("mouth")), "centerline", "s-ink");
  // little absorb ripples where the chair sinks in
  add(strokePath([{ x: 178, y: 148 }, { x: 186, y: 150 }], "centerline", { wobble: 0.3 }, rng.fork("rip1")), "centerline", "s-pencil");
  add(strokePath([{ x: 176, y: 156 }, { x: 184, y: 158 }], "centerline", { wobble: 0.3 }, rng.fork("rip2")), "centerline", "s-pencil");
  return strokes;
};
