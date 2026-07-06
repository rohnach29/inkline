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

  // clamp floored at 3 — a 2-lap chapter still wears a stylized 3-loop crown so
  // the crown reads as a crown at every count
  const laps = clamp(Math.round(params.count ?? 3), 3, 6);

  // ground + podium (faint)
  add(strokePath([{ x: 76, y: 184 }, { x: 164, y: 184 }], "centerline", { wobble: 0.4 }, rng.fork("gnd")), "centerline", "s-faint");
  add(strokePath([{ x: 96, y: 184 }, { x: 96, y: 168 }, { x: 144, y: 168 }, { x: 144, y: 184 }], "centerline", { wobble: 0.4 }, rng.fork("podium")), "centerline", "s-faint");
  add(strokePath([{ x: 96, y: 176 }, { x: 144, y: 176 }], "centerline", { wobble: 0.3 }, rng.fork("podium2")), "centerline", "s-faint");

  // the Kid, arms up on the podium. Drawn before the crown so the crown sits on
  // top of the head.
  strokes.push(...kidStrokes("looking-up", { x: 120, y: 168, scale: 1.05 }, rng.fork("kid"), order));
  order += 60;

  // the crown: a flat road-band ringing the head ABOVE the hair (two horizontal
  // arcs), with `laps` wide, flat road-loops rising off it — each loop
  // double-lined with a dashed lane down the middle. Loops are always wider
  // than tall so the crown reads as a crown, never as ears.
  const cxHead = 121;
  const bandTop = 110; // just above the hair blob (hair top ~113)
  const bandH = 4.5;
  const span = 48;
  const left = cxHead - span / 2;
  // the visible flat band: top + bottom arcs, closed with short end ticks
  add(strokePath([{ x: left, y: bandTop + 1 }, { x: cxHead, y: bandTop - 1 }, { x: left + span, y: bandTop + 1 }], "centerline", { wobble: 0.4 }, rng.fork("band1")), "centerline", "s-ink");
  add(strokePath([{ x: left, y: bandTop + bandH + 1 }, { x: cxHead, y: bandTop + bandH - 1 }, { x: left + span, y: bandTop + bandH + 1 }], "centerline", { wobble: 0.4 }, rng.fork("band2")), "centerline", "s-ink");
  add(strokePath([{ x: left, y: bandTop + 1 }, { x: left, y: bandTop + bandH + 1 }], "centerline", { wobble: 0.3 }, rng.fork("bandL")), "centerline", "s-ink");
  add(strokePath([{ x: left + span, y: bandTop + 1 }, { x: left + span, y: bandTop + bandH + 1 }], "centerline", { wobble: 0.3 }, rng.fork("bandR")), "centerline", "s-ink");
  const w = 2.2;
  for (let i = 0; i < laps; i++) {
    const x0 = left + (span / laps) * i + 1;
    const x1 = left + (span / laps) * (i + 1) - 1;
    const loopW = x1 - x0;
    const h = Math.min(11, loopW * 0.7); // strictly flatter than wide
    const midX = (x0 + x1) / 2;
    const peakY = bandTop - h;
    // wide flat arch: shoulders swing out, crown is a plateau
    const outer: Pt[] = [
      { x: x0, y: bandTop }, { x: x0 + loopW * 0.12, y: peakY + h * 0.35 },
      { x: x0 + loopW * 0.35, y: peakY }, { x: x1 - loopW * 0.35, y: peakY },
      { x: x1 - loopW * 0.12, y: peakY + h * 0.35 }, { x: x1, y: bandTop },
    ];
    const inner: Pt[] = [
      { x: x0 + w, y: bandTop }, { x: x0 + loopW * 0.18, y: peakY + h * 0.35 + w * 0.7 },
      { x: x0 + loopW * 0.38, y: peakY + w * 1.4 }, { x: x1 - loopW * 0.38, y: peakY + w * 1.4 },
      { x: x1 - loopW * 0.18, y: peakY + h * 0.35 + w * 0.7 }, { x: x1 - w, y: bandTop },
    ];
    add(strokePath(outer, "centerline", { wobble: 0.4 }, rng.fork(`ao:${i}`)), "centerline", "s-ink");
    add(strokePath(inner, "centerline", { wobble: 0.4 }, rng.fork(`ai:${i}`)), "centerline", "s-ink");
    add(strokePath([{ x: x0 + w / 2, y: bandTop - 1 }, { x: midX, y: peakY + w * 0.7 }, { x: x1 - w / 2, y: bandTop - 1 }], "centerline", { wobble: 0.3 }, rng.fork(`ad:${i}`)), "centerline", "s-pencil");
  }
  return strokes;
};
