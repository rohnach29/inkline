import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const circle = (cx: number, cy: number, r: number, n = 12): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });

/** BEAST — the false start: a small pot-bellied gremlin, big pointy ears and a
 *  smug proud grin, holding a stolen LEFT shoe aloft like a trophy. The Kid,
 *  one shoe short, reaches up for it from the bottom-left. Portrait: the gremlin
 *  fills the frame and is drawn LAST. */
export const scene: SceneFn = (_params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // ground — faint
  add(strokePath([{ x: 14, y: 186 }, { x: 226, y: 186 }], "centerline", { wobble: 0.4 }, rng.fork("gnd")), "centerline", "s-faint");

  // the Kid, bottom-left, hopping on one foot and reaching up for its shoe.
  // "climbing" the empty air toward the held-high trophy. One bare foot.
  strokes.push(...kidStrokes("climbing", { x: 34, y: 184, scale: 0.55 }, rng.fork("kid"), order));
  order += 40;
  // a little "hey!" tick by the reaching Kid
  add(strokePath([{ x: 52, y: 132 }, { x: 57, y: 128 }], "centerline", { wobble: 0.3 }, rng.fork("hey")), "centerline", "s-pencil");

  // ---- THE GREMLIN (drawn last) ----
  // pot-belly body
  const belly: Pt[] = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x: 120 + Math.cos(a) * 40, y: 122 + Math.sin(a) * 46 };
  });
  add(strokePath(belly, "centerline", { wobble: 0.6 }, rng.fork("belly")), "centerline", "s-ink");

  // head sitting on the belly
  add(strokePath(circle(120, 68, 22, 16), "centerline", { wobble: 0.6 }, rng.fork("head")), "centerline", "s-ink");
  // two big pointy ears
  add(strokePath([{ x: 104, y: 54 }, { x: 86, y: 28 }, { x: 106, y: 48 }], "centerline", { wobble: 0.4 }, rng.fork("earL")), "centerline", "s-ink");
  add(strokePath([{ x: 136, y: 54 }, { x: 154, y: 28 }, { x: 134, y: 48 }], "centerline", { wobble: 0.4 }, rng.fork("earR")), "centerline", "s-ink");

  // smug proud face
  // gleeful eyes
  add(strokePath(circle(110, 64, 3, 10), "centerline", { wobble: 0.2 }, rng.fork("eyeL")), "centerline", "s-ink");
  add(strokePath(circle(130, 64, 3, 10), "centerline", { wobble: 0.2 }, rng.fork("eyeR")), "centerline", "s-ink");
  add(strokePath(circle(111, 64, 1, 6), "outline", { width: 2, wobble: 0.1 }, rng.fork("pupL")), "outline", "s-ink");
  add(strokePath(circle(131, 64, 1, 6), "outline", { width: 2, wobble: 0.1 }, rng.fork("pupR")), "outline", "s-ink");
  // one cocky raised eyebrow (right), one flat (left)
  add(strokePath([{ x: 124, y: 56 }, { x: 137, y: 52 }], "centerline", { wobble: 0.2 }, rng.fork("browR")), "centerline", "s-ink");
  add(strokePath([{ x: 104, y: 57 }, { x: 116, y: 57 }], "centerline", { wobble: 0.2 }, rng.fork("browL")), "centerline", "s-ink");
  // the wide smug grin, curling up at one corner, with a single snaggle tooth
  add(strokePath([{ x: 106, y: 80 }, { x: 116, y: 87 }, { x: 128, y: 86 }, { x: 137, y: 76 }], "centerline", { wobble: 0.3 }, rng.fork("grin")), "centerline", "s-ink");
  add(strokePath([{ x: 120, y: 85.5 }, { x: 122, y: 91 }, { x: 125, y: 85 }], "centerline", { wobble: 0.2 }, rng.fork("tooth")), "centerline", "s-ink");

  // left arm on hip (smug)
  add(strokePath([{ x: 84, y: 106 }, { x: 72, y: 122 }, { x: 84, y: 134 }], "centerline", { wobble: 0.5 }, rng.fork("armHip")), "centerline", "s-ink");
  // right arm raised high, holding the trophy shoe
  add(strokePath([{ x: 152, y: 106 }, { x: 168, y: 86 }, { x: 176, y: 64 }], "centerline", { wobble: 0.5 }, rng.fork("armUp")), "centerline", "s-ink");

  // stubby clawed legs
  for (const [lx, dir] of [[106, -1], [134, 1]] as const) {
    add(strokePath([{ x: lx, y: 166 }, { x: lx + dir * 2, y: 182 }], "centerline", { wobble: 0.4 }, rng.fork(`leg:${lx}`)), "centerline", "s-ink");
    for (let c = -1; c <= 1; c++) {
      add(strokePath([{ x: lx + dir * 2, y: 182 }, { x: lx + dir * 2 + c * 4 + dir * 3, y: 186 }], "centerline", { wobble: 0.2 }, rng.fork(`claw:${lx}:${c}`)), "centerline", "s-ink");
    }
  }

  // the stolen LEFT shoe, held aloft — toe pointing left, a clear sneaker
  const shx = 176;
  const shy = 60;
  add(strokePath([{ x: shx - 14, y: shy + 6 }, { x: shx + 10, y: shy + 5 }], "centerline", { wobble: 0.3 }, rng.fork("shSole")), "centerline", "s-ink");
  add(strokePath([{ x: shx - 14, y: shy + 6 }, { x: shx - 16, y: shy }, { x: shx - 10, y: shy - 4 }], "centerline", { wobble: 0.3 }, rng.fork("shToe")), "centerline", "s-ink");
  add(strokePath([{ x: shx - 10, y: shy - 4 }, { x: shx, y: shy - 6 }, { x: shx + 8, y: shy - 2 }, { x: shx + 10, y: shy + 5 }], "centerline", { wobble: 0.3 }, rng.fork("shUp")), "centerline", "s-ink");
  add(strokePath([{ x: shx + 6, y: shy - 3 }, { x: shx + 12, y: shy - 6 }], "centerline", { wobble: 0.2 }, rng.fork("shCollar")), "centerline", "s-ink");
  for (let i = 0; i < 3; i++) {
    add(strokePath([{ x: shx - 6 + i * 5, y: shy - 3 }, { x: shx - 3 + i * 5, y: shy + 2 }], "centerline", { wobble: 0.2 }, rng.fork(`shLace:${i}`)), "centerline", "s-ink");
  }
  // proud sparkles by the trophy
  add(strokePath([{ x: shx + 14, y: shy - 8 }, { x: shx + 18, y: shy - 12 }], "centerline", { wobble: 0.2 }, rng.fork("spk1")), "centerline", "s-pencil");
  add(strokePath([{ x: shx + 12, y: shy - 12 }, { x: shx + 16, y: shy - 8 }], "centerline", { wobble: 0.2 }, rng.fork("spk2")), "centerline", "s-pencil");
  return strokes;
};
