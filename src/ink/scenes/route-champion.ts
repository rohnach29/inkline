import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid on a podium, arms flung up, wearing a loop of road as a champion's
 *  crown — one crown-loop struck for every lap run. */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  const laps = clamp(Math.round(params.count ?? 3), 2, 6);

  // ground + podium (faint)
  add(strokePath([{ x: 76, y: 184 }, { x: 164, y: 184 }], "centerline", { wobble: 0.4 }, rng.fork("gnd")), "centerline", "s-faint");
  add(strokePath([{ x: 96, y: 184 }, { x: 96, y: 168 }, { x: 144, y: 168 }, { x: 144, y: 184 }], "centerline", { wobble: 0.4 }, rng.fork("podium")), "centerline", "s-faint");
  add(strokePath([{ x: 96, y: 176 }, { x: 144, y: 176 }], "centerline", { wobble: 0.3 }, rng.fork("podium2")), "centerline", "s-faint");

  // the Kid, arms up on the podium. Drawn before the crown so the crown sits on
  // top of the head.
  strokes.push(...kidStrokes("looking-up", { x: 120, y: 168, scale: 1.05 }, rng.fork("kid"), order));
  order += 60;

  // the crown: a road circlet running round the brow, with `laps` rounded loops
  // rising off it — each loop double-lined with a dashed lane down the middle
  const cxHead = 121;
  const baseY = 116;
  const span = 46;
  const left = cxHead - span / 2;
  // the circlet band (slightly bowed, a clear ring the loops sit on)
  add(strokePath([{ x: left, y: baseY + 3 }, { x: cxHead, y: baseY }, { x: left + span, y: baseY + 3 }], "centerline", { wobble: 0.4 }, rng.fork("band1")), "centerline", "s-ink");
  add(strokePath([{ x: left, y: baseY + 6 }, { x: cxHead, y: baseY + 3 }, { x: left + span, y: baseY + 6 }], "centerline", { wobble: 0.4 }, rng.fork("band2")), "centerline", "s-ink");
  const w = 2.6;
  for (let i = 0; i < laps; i++) {
    const x0 = left + (span / laps) * i;
    const x1 = left + (span / laps) * (i + 1);
    const midX = (x0 + x1) / 2;
    const peakY = baseY - 20 - (i % 2) * 4;
    // rounded loop = a 5-point arch bowing up and back down to the circlet
    const outer: Pt[] = [
      { x: x0, y: baseY }, { x: x0 + (midX - x0) * 0.4, y: peakY + (baseY - peakY) * 0.3 },
      { x: midX, y: peakY }, { x: x1 - (x1 - midX) * 0.4, y: peakY + (baseY - peakY) * 0.3 }, { x: x1, y: baseY },
    ];
    const inner: Pt[] = [
      { x: x0 + w, y: baseY }, { x: x0 + (midX - x0) * 0.45, y: peakY + (baseY - peakY) * 0.3 + w },
      { x: midX, y: peakY + w * 1.6 }, { x: x1 - (x1 - midX) * 0.45, y: peakY + (baseY - peakY) * 0.3 + w }, { x: x1 - w, y: baseY },
    ];
    add(strokePath(outer, "centerline", { wobble: 0.4 }, rng.fork(`ao:${i}`)), "centerline", "s-ink");
    add(strokePath(inner, "centerline", { wobble: 0.4 }, rng.fork(`ai:${i}`)), "centerline", "s-ink");
    add(strokePath([{ x: x0 + w / 2, y: baseY - 1 }, { x: midX, y: peakY + w * 0.8 }, { x: x1 - w / 2, y: baseY - 1 }], "centerline", { wobble: 0.3 }, rng.fork(`ad:${i}`)), "centerline", "s-pencil");
  }
  return strokes;
};
