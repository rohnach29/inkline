# Plan G — The Kid & the Ink Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse object-icon doodles with a stroke-synthesis ink engine drawing a recurring Kid character into 22 hand-composed scenes (16 chapter types, 5 beasts, 1 cover), each shipped only after a visual screenshot gate.

**Architecture:** New `src/ink/` package: `stroke.ts` (pen-plausible stroke synthesis: resample → wobble → centerline or tapered outline), `fills.ts` (scribble + hatch clipped to blobs), `kid.ts` (the parameterized character rig), `scenes/` (one module per scene tag, emitting `OrderedStroke[]`), `index.ts` (`renderScene` → final `<svg>`). Integration replaces `doodles.ts`, adds per-stroke draw-in to the living layer, and threads a book-seeded `Rng` through `pages.ts`.

**Tech Stack:** TypeScript strict, Vitest, existing seeded `Rng` (`src/storytell/rng.ts`: `next()`, `int(n)`, `pick(arr)`, `fork(label)`). Visual gate via the scratchpad playwright-core + system Chrome harness. No new dependencies.

## Global Constraints

- Deterministic: same Year → identical Book AND identical scene SVGs. No `Date.now`/`Math.random`; all randomness through `Rng.fork`. Scene fork labels exactly: `scene:${chapter.id}` (chapters), `scene:beast:${beast.name}` (beasts), `scene:cover` (cover).
- Runtime deps stay exactly `fflate` + `tz-lookup`.
- Scene viewBox exactly `0 0 240 200`; scene SVGs do NOT reference `filter="url(#wobble)"` (engine wobble replaces feTurbulence); route/flight maps keep the wobble filter untouched.
- Strokes carry token classes only (`s-ink` / `s-faint` / `s-pencil`), colored via CSS custom properties — zero literal colors in scene markup; both themes must render correctly.
- Wobble displacement bounded: < 2.5 viewBox units (test-enforced).
- Stroke budget: < 400 strokes per scene (test-enforced).
- Every scene contains the Kid; gag per scene is LOCKED by the spec's gag table (`docs/superpowers/specs/2026-07-06-inkline-rebirth-design.md`, Plan G section) — staging may be refined in the visual gate, the concept may not.
- **Visual gate is mandatory per scene task**: every scene × both themes × small/large params rendered to PNG and approved BY EYE by the controller. A scene reviewed only as code is an incomplete task.
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Subagents never push.

## File Structure

```
src/ink/
  types.ts      # Pt, OrderedStroke, SCENE_W/H, SceneTag, SceneParams, SceneFn
  stroke.ts     # resample, strokePath (centerline | tapered outline, wobble)
  fills.ts      # scribbleFill, hatchFill (+ polygon span clipping)
  kid.ts        # the Kid rig: kidStrokes(pose, opts, rng, orderBase)
  scenes/
    index.ts    # SCENES registry (all 22 tags)
    <tag>.ts    # one module per scene (16 chapter + 5 beast + cover)
  index.ts      # renderScene(tag, params, rng): string  (+ re-exports)
  stroke.test.ts fills.test.ts kid.test.ts scenes.test.ts
src/living/scene-reveal.ts   # per-stroke draw-in, joins CHAPTER_REVEALERS
DELETED: src/render/doodles.ts, src/render/doodles.test.ts
MODIFIED: storytell/types.ts+book.ts (sceneParams replaces doodleTags; BeastEntry drops doodleTag),
          render/pages.ts (renderScene wiring, rng from book.seed), render/theme.css,
          living/index.ts (register revealScene)
Scratchpad harness: render-scenes.mts + scene-shots.mjs (visual gate)
```

---

### Task 1: Stroke engine

**Files:**
- Create: `src/ink/types.ts`, `src/ink/stroke.ts`
- Test: `src/ink/stroke.test.ts`

**Interfaces:**
- Consumes: `Rng` from `../storytell/rng` (`next()`, `fork(label)`).
- Produces (all later tasks rely on these exact names):
  - `types.ts`: `Pt {x,y}`, `OrderedStroke {d, mode, cls, order}`, `SCENE_W=240`, `SCENE_H=200`, `SceneTag`, `SceneParams`, `SceneFn`
  - `stroke.ts`: `resample(pts, step?): Pt[]`, `strokePath(points, mode, opts, rng): string`, `StrokeOpts {width?, taper?, wobble?, overshoot?}`

- [ ] **Step 1: Write `types.ts`** (complete file):

```ts
import type { StoryEventType } from "../analyze/types";
import type { Rng } from "../storytell/rng";

export interface Pt {
  x: number;
  y: number;
}

/** One pen stroke of a scene, in draw order. `centerline` strokes render as
 *  stroked paths (and draw in via dash animation); `outline` strokes are
 *  closed variable-width shapes rendered as fills (and fade in). */
export interface OrderedStroke {
  d: string;
  mode: "centerline" | "outline";
  cls: "s-ink" | "s-faint" | "s-pencil";
  order: number;
}

export const SCENE_W = 240;
export const SCENE_H = 200;

export type SceneTag =
  | StoryEventType
  | "beast-quiet"
  | "beast-hill"
  | "beast-night"
  | "beast-false-start"
  | "beast-ghost"
  | "cover";

/** Data-driven knobs a scene may read (all optional; scenes clamp). */
export interface SceneParams {
  km?: number;
  days?: number;
  count?: number;
  gainM?: number;
  paceMinPerKm?: number;
}

export type SceneFn = (params: SceneParams, rng: Rng) => OrderedStroke[];
```

- [ ] **Step 2: Write the failing tests** (`stroke.test.ts`, complete file):

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { resample, strokePath } from "./stroke";
import type { Pt } from "./types";

const line = (n: number): Pt[] => Array.from({ length: n }, (_, i) => ({ x: i * 20, y: 100 }));

/** every coordinate pair in a path d string */
const coords = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

describe("resample", () => {
  it("spaces points evenly along the polyline", () => {
    const pts = resample(line(6), 3);
    for (let i = 1; i < pts.length - 1; i++) {
      const dst = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      expect(dst).toBeGreaterThan(1.5);
      expect(dst).toBeLessThan(4.5);
    }
  });
  it("keeps endpoints", () => {
    const pts = resample(line(6), 3);
    expect(pts[0]).toEqual({ x: 0, y: 100 });
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(last.x - 100, last.y - 100)).toBeLessThan(1);
  });
});

describe("strokePath", () => {
  it("is deterministic for the same rng seed", () => {
    const a = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    const b = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    expect(a).toBe(b);
  });
  it("differs across seeds (wobble is live)", () => {
    const a = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(7).fork("s"));
    const b = strokePath(line(6), "centerline", { wobble: 1.2 }, new Rng(8).fork("s"));
    expect(a).not.toBe(b);
  });
  it("bounds wobble displacement under 2.5 units even when asked for more", () => {
    const d = strokePath(line(12), "centerline", { wobble: 9 }, new Rng(3).fork("w"));
    for (const p of coords(d)) expect(Math.abs(p.y - 100)).toBeLessThan(2.5);
  });
  it("pins endpoints (skeleton joints stay joined)", () => {
    const d = strokePath(line(12), "centerline", { wobble: 2 }, new Rng(5).fork("p"));
    const pts = coords(d);
    expect(Math.abs(pts[0]!.y - 100)).toBeLessThan(0.01);
  });
  it("outline mode emits a closed filled shape", () => {
    const d = strokePath(line(6), "outline", { width: 3 }, new Rng(2).fork("o"));
    expect(d.trim().endsWith("Z")).toBe(true);
    const ys = coords(d).map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(100);
    expect(Math.min(...ys)).toBeLessThan(100); // both sides of the centerline
  });
  it("overshoot extends past the last point", () => {
    const d = strokePath(line(6), "centerline", { wobble: 0, overshoot: 6 }, new Rng(1).fork("v"));
    const xs = coords(d).map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(103);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `npx vitest run src/ink` — FAILS (`stroke.ts` missing).
- [ ] **Step 4: Write `stroke.ts`** (complete file):

```ts
import type { Rng } from "../storytell/rng";
import type { Pt } from "./types";

export interface StrokeOpts {
  /** outline max width in viewBox units (default 2.4) */
  width?: number;
  /** fraction (0.02–0.5) of stroke length tapering at each end (default 0.22) */
  taper?: number;
  /** max perpendicular displacement; engine clamps to 2.4 (default 1.1) */
  wobble?: number;
  /** units to extend past the final point — pen overshoot at corners (default 0) */
  overshoot?: number;
}

const WOBBLE_MAX = 2.4;
const r2 = (n: number): number => Math.round(n * 100) / 100;

export function resample(pts: readonly Pt[], step = 3): Pt[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p }));
  const out: Pt[] = [{ ...pts[0]! }];
  let prev: Pt = pts[0]!;
  let need = step;
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!;
    let dx = cur.x - prev.x;
    let dy = cur.y - prev.y;
    let len = Math.hypot(dx, dy);
    while (len >= need) {
      const t = need / len;
      prev = { x: prev.x + dx * t, y: prev.y + dy * t };
      out.push({ ...prev });
      dx = cur.x - prev.x;
      dy = cur.y - prev.y;
      len = Math.hypot(dx, dy);
      need = step;
    }
    need -= len;
    prev = cur;
  }
  const last = pts[pts.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.5) out.push({ ...last });
  return out;
}

/** unit normals from neighbor differences */
function normals(pts: readonly Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
}

/** two slow incommensurate sines, phases/frequencies from the rng; endpoints
 *  pinned so strokes still meet where the skeleton says they meet */
function wobbled(pts: readonly Pt[], amp: number, rng: Rng): Pt[] {
  if (amp <= 0 || pts.length < 3) return pts.map((p) => ({ ...p }));
  const a = Math.min(amp, WOBBLE_MAX);
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;
  const f1 = 0.55 + rng.next() * 0.25;
  const f2 = 0.13 + rng.next() * 0.09;
  const ns = normals(pts);
  return pts.map((p, i) => {
    // 0.45+0.55 sine mix keeps |w| < a strictly under the 2.5 test bound
    const w = a * (0.45 * Math.sin(i * f1 + p1) + 0.55 * Math.sin(i * f2 + p2)) * 0.99;
    const pin = Math.min(1, i / 2, (pts.length - 1 - i) / 2);
    return { x: p.x + ns[i]!.x * w * pin, y: p.y + ns[i]!.y * w * pin };
  });
}

/** midpoint-quadratic smoothing (same idiom as render/svg.ts routes) */
function centerlineD(pts: readonly Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${r2(pts[0]!.x)},${r2(pts[0]!.y)}`;
  let d = `M${r2(pts[0]!.x)},${r2(pts[0]!.y)}`;
  if (pts.length === 2) return d + `L${r2(pts[1]!.x)},${r2(pts[1]!.y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const c = pts[i]!;
    const n = pts[i + 1]!;
    d += `Q${r2(c.x)},${r2(c.y)} ${r2((c.x + n.x) / 2)},${r2((c.y + n.y) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return d + `L${r2(last.x)},${r2(last.y)}`;
}

function outlineD(pts: readonly Pt[], width: number, taper: number): string {
  const ns = normals(pts);
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const ramp = Math.max(0.12, Math.min(1, t / taper, (1 - t) / taper));
    const hw = (width * ramp) / 2;
    left.push({ x: pts[i]!.x + ns[i]!.x * hw, y: pts[i]!.y + ns[i]!.y * hw });
    right.push({ x: pts[i]!.x - ns[i]!.x * hw, y: pts[i]!.y - ns[i]!.y * hw });
  }
  right.reverse();
  const seg = (ps: readonly Pt[]): string => ps.map((p) => `L${r2(p.x)},${r2(p.y)}`).join("");
  return `M${r2(left[0]!.x)},${r2(left[0]!.y)}${seg(left.slice(1))}${seg(right)}Z`;
}

export function strokePath(
  points: readonly Pt[],
  mode: "centerline" | "outline",
  opts: StrokeOpts,
  rng: Rng,
): string {
  let pts = resample(points);
  const over = opts.overshoot ?? 0;
  if (over > 0 && pts.length >= 2) {
    const a = pts[pts.length - 2]!;
    const b = pts[pts.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts.push({ x: b.x + ((b.x - a.x) / len) * over, y: b.y + ((b.y - a.y) / len) * over });
  }
  pts = wobbled(pts, opts.wobble ?? 1.1, rng);
  if (mode === "centerline") return centerlineD(pts);
  const taper = Math.min(0.5, Math.max(0.02, opts.taper ?? 0.22));
  return outlineD(pts, opts.width ?? 2.4, taper);
}
```

- [ ] **Step 5: Run to verify pass.** `npx vitest run src/ink` → all pass. `npx tsc --noEmit` → 0.
- [ ] **Step 6: Commit** `git add src/ink && git commit -m "feat: ink stroke engine — resample, wobble, taper, overshoot"`.

---

### Task 2: Fills — scribble and hatch

**Files:**
- Create: `src/ink/fills.ts`
- Test: `src/ink/fills.test.ts`

**Interfaces:**
- Consumes: `Pt` from `./types`, `Rng`.
- Produces: `scribbleFill(blob, spacing, angle, rng): string` (ONE connected zigzag centerline d), `hatchFill(blob, spacing, angle, rng): string[]` (separate short centerline d's), `pointInPolygon(p, poly): boolean` (exported for tests and scene sanity checks).

- [ ] **Step 1: Write the failing tests** (`fills.test.ts`, complete file):

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { hatchFill, pointInPolygon, scribbleFill } from "./fills";
import type { Pt } from "./types";

const SQUARE: Pt[] = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }];
const coords = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

describe("pointInPolygon", () => {
  it("classifies inside/outside", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 10, y: 50 }, SQUARE)).toBe(false);
  });
});

describe("scribbleFill", () => {
  it("is deterministic and stays inside the blob (±2 units)", () => {
    const a = scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f"));
    expect(a).toBe(scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f")));
    for (const p of coords(a)) {
      expect(p.x).toBeGreaterThan(18);
      expect(p.x).toBeLessThan(82);
      expect(p.y).toBeGreaterThan(18);
      expect(p.y).toBeLessThan(82);
    }
  });
  it("is one connected path (single M)", () => {
    const d = scribbleFill(SQUARE, 4, 0, new Rng(9).fork("f"));
    expect(d.match(/M/g)!.length).toBe(1);
  });
});

describe("hatchFill", () => {
  it("emits separate segments, all inside (±2 units)", () => {
    const ds = hatchFill(SQUARE, 6, Math.PI / 4, new Rng(4).fork("h"));
    expect(ds.length).toBeGreaterThan(3);
    for (const d of ds) for (const p of coords(d)) {
      expect(p.x).toBeGreaterThan(18);
      expect(p.x).toBeLessThan(82);
      expect(p.y).toBeGreaterThan(18);
      expect(p.y).toBeLessThan(82);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Write `fills.ts`** (complete file):

```ts
import type { Rng } from "../storytell/rng";
import type { Pt } from "./types";

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** x-intervals where the horizontal line at `y` is inside `poly` (even-odd) */
function spans(poly: readonly Pt[], y: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
  }
  xs.sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

function rotate(p: Pt, ang: number): Pt {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** scanline rows of in-polygon segments, computed in a frame rotated by -angle */
function rows(
  blob: readonly Pt[],
  spacing: number,
  angle: number,
  rng: Rng,
  inset: number,
): Array<Array<[Pt, Pt]>> {
  const rot = blob.map((p) => rotate(p, -angle));
  const ys = rot.map((p) => p.y);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const out: Array<Array<[Pt, Pt]>> = [];
  for (let y = y0 + spacing / 2; y < y1; y += spacing * (0.8 + rng.next() * 0.4)) {
    const row: Array<[Pt, Pt]> = [];
    for (const [xa, xb] of spans(rot, y)) {
      if (xb - xa < inset * 2) continue;
      const jy = y + (rng.next() - 0.5) * spacing * 0.2;
      row.push([rotate({ x: xa + inset, y: jy }, angle), rotate({ x: xb - inset, y: jy }, angle)]);
    }
    if (row.length > 0) out.push(row);
  }
  return out;
}

/** dense back-and-forth zigzag clipped to the blob — hair, shadow, fog */
export function scribbleFill(blob: readonly Pt[], spacing: number, angle: number, rng: Rng): string {
  const rs = rows(blob, spacing, angle, rng, 1.5);
  let d = "";
  let flip = false;
  for (const row of rs) {
    for (const [a, b] of row) {
      const from = flip ? b : a;
      const to = flip ? a : b;
      d += d === "" ? `M${r2(from.x)},${r2(from.y)}` : `L${r2(from.x)},${r2(from.y)}`;
      d += `L${r2(to.x)},${r2(to.y)}`;
      flip = !flip;
    }
  }
  return d;
}

/** parallel broken hatching — ground, hillsides */
export function hatchFill(blob: readonly Pt[], spacing: number, angle: number, rng: Rng): string[] {
  const rs = rows(blob, spacing, angle, rng, 1.5);
  const out: string[] = [];
  for (const row of rs) {
    for (const [a, b] of row) out.push(`M${r2(a.x)},${r2(a.y)}L${r2(b.x)},${r2(b.y)}`);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass.** `npx vitest run src/ink` + `npx tsc --noEmit` green.
- [ ] **Step 5: Commit** `git add src/ink && git commit -m "feat: ink fills — scribble and hatch clipped to blobs"`.

---

### Task 3: The Kid rig, renderScene shell, and the visual harness

**Files:**
- Create: `src/ink/kid.ts`, `src/ink/index.ts`, `src/ink/scenes/index.ts` (registry, empty until Tasks 4–6)
- Create (scratchpad, not committed): `render-scenes.mts` + `scene-shots.mjs` (paths below)
- Modify: `src/render/theme.css` (scene stroke classes — needed for the harness)
- Test: `src/ink/kid.test.ts`

**Interfaces:**
- Consumes: `strokePath`, `scribbleFill` from Tasks 1–2; `OrderedStroke`, `Pt`, `SceneTag`, `SceneParams`, `SceneFn`, `SCENE_W/H` from `./types`.
- Produces:
  - `kid.ts`: `type KidPose = "running" | "collapsed" | "climbing" | "sleeping" | "looking-up" | "dragging" | "mid-air"`; `interface KidOpts { x: number; y: number; scale?: number; flip?: boolean; lean?: number }`; `kidStrokes(pose: KidPose, opts: KidOpts, rng: Rng, orderBase: number): OrderedStroke[]` — the Kid drawn feet-anchored at (x, y), ~46 units tall at scale 1.
  - `scenes/index.ts`: `SCENES: Partial<Record<SceneTag, SceneFn>>` (modules register as Tasks 4–6 land).
  - `index.ts`: `renderScene(tag: SceneTag, params: SceneParams, rng: Rng): string` — full `<svg class="ink-scene" viewBox="0 0 240 200" …>` with one `<path>` per stroke carrying `class`, `data-order`, `data-mode`; returns `""` for unregistered tags (callers degrade gracefully until all scenes land).

The Kid's fixed identity (constants in `kid.ts`, tuned in the visual gate but never per-scene): big round head (r≈8), one dot eye, nose-first profile (a bump arc protruding ≈4 units), wild scribble hair, noodle limbs (centerline, wobble 1.4), enormous bare feet (outline ellipses ≈9 long — the feet are the joke), body drawn with outline strokes width≈2.6.

- [ ] **Step 1: Write the failing test** (`kid.test.ts`, complete file):

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { kidStrokes, type KidPose } from "./kid";

const POSES: KidPose[] = ["running", "collapsed", "climbing", "sleeping", "looking-up", "dragging", "mid-air"];

describe("kidStrokes", () => {
  it("renders every pose deterministically with sane stroke counts", () => {
    for (const pose of POSES) {
      const a = kidStrokes(pose, { x: 120, y: 160 }, new Rng(11).fork(pose), 0);
      const b = kidStrokes(pose, { x: 120, y: 160 }, new Rng(11).fork(pose), 0);
      expect(a).toEqual(b);
      expect(a.length).toBeGreaterThanOrEqual(8); // head, hair, eye, nose, torso, 2+ limbs, 2 feet
      expect(a.length).toBeLessThan(60);
      for (const s of a) expect(s.d.length).toBeGreaterThan(0);
    }
  });
  it("orders strokes sequentially from orderBase", () => {
    const s = kidStrokes("running", { x: 120, y: 160 }, new Rng(1).fork("r"), 100);
    expect(Math.min(...s.map((x) => x.order))).toBe(100);
    const orders = s.map((x) => x.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
  it("flip mirrors x around the anchor", () => {
    const norm = kidStrokes("running", { x: 120, y: 160 }, new Rng(1).fork("r"), 0);
    const flip = kidStrokes("running", { x: 120, y: 160, flip: true }, new Rng(1).fork("r"), 0);
    expect(flip).not.toEqual(norm);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: Write `kid.ts`** — reference implementation (complete; geometry refined under the visual gate, structure fixed):

```ts
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
    head: P(6, -38), torso: [P(3, -30), P(0, -16)],
    armF: [P(2, -27), P(10, -22), P(14, -27)], armB: [P(2, -27), P(-7, -24), P(-11, -18)],
    legF: [P(0, -16), P(8, -9), P(12, -2)], legB: [P(0, -16), P(-6, -8), P(-12, -4)],
    footF: [P(12, -2), P(21, -1)], footB: [P(-12, -4), P(-4, -6)],
    eyeOpen: true,
  },
  collapsed: {
    head: P(2, -22), torso: [P(0, -15), P(-2, -4)],
    armF: [P(0, -13), P(7, -8), P(11, -3)], armB: [P(0, -13), P(-6, -9), P(-9, -3)],
    legF: [P(-2, -4), P(6, -3), P(13, -2)], legB: [P(-2, -4), P(4, -5), P(10, -6)],
    footF: [P(13, -2), P(21, -3)], footB: [P(10, -6), P(18, -7)],
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
    head: P(-14, -6), torso: [P(-7, -5), P(6, -4)],
    armF: [P(-5, -5), P(0, -2), P(4, -4)], armB: [P(-5, -5), P(-2, -8), P(2, -7)],
    legF: [P(6, -4), P(13, -3), P(19, -5)], legB: [P(6, -4), P(12, -6), P(17, -8)],
    footF: [P(19, -5), P(26, -3)], footB: [P(17, -8), P(24, -7)],
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
  const hairBlob = circle({ x: headC.x - 2 * s * fx, y: headC.y - r * 0.75 }, r * 0.75, 10);
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
```

- [ ] **Step 4: Write `scenes/index.ts`** (registry, empty for now) and `index.ts`:

```ts
// src/ink/scenes/index.ts
import type { SceneFn, SceneTag } from "../types";

/** Scene modules register here as Tasks 4–6 land them. */
export const SCENES: Partial<Record<SceneTag, SceneFn>> = {};
```

```ts
// src/ink/index.ts
import type { Rng } from "../storytell/rng";
import { SCENES } from "./scenes/index";
import { SCENE_H, SCENE_W, type SceneParams, type SceneTag } from "./types";

export { kidStrokes } from "./kid";
export type { KidOpts, KidPose } from "./kid";
export { strokePath, resample } from "./stroke";
export { scribbleFill, hatchFill, pointInPolygon } from "./fills";
export * from "./types";

/** Full scene SVG, or "" when the tag has no registered scene yet.
 *  One <path> per stroke; centerline strokes stroke with currentColor via
 *  their class, outline strokes fill. No wobble filter — the engine wobbles. */
export function renderScene(tag: SceneTag, params: SceneParams, rng: Rng): string {
  const fn = SCENES[tag];
  if (!fn) return "";
  const strokes = [...fn(params, rng)].sort((a, b) => a.order - b.order);
  const paths = strokes
    .map(
      (s) =>
        `<path d="${s.d}" class="${s.cls}" data-order="${s.order}" data-mode="${s.mode}"/>`,
    )
    .join("");
  return `<svg class="ink-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}" data-scene="${tag}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${paths}</svg>`;
}
```

- [ ] **Step 5: Scene stroke CSS.** Append to `src/render/theme.css` (uses existing `--ink`/`--ink-faint`/`--pencil` tokens):

```css
/* --- ink scenes (Plan G) ------------------------------------------- */
.ink-scene { width: 100%; height: auto; color: var(--ink); }
.ink-scene .s-ink { color: var(--ink); }
.ink-scene .s-faint { color: var(--ink-faint); }
.ink-scene .s-pencil { color: var(--pencil); }
.ink-scene path[data-mode="centerline"] {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ink-scene path[data-mode="outline"] { fill: currentColor; stroke: none; }
```

- [ ] **Step 6: Run tests + typecheck.** `npx vitest run src/ink` green; `npx tsc --noEmit` → 0.
- [ ] **Step 7: Build the visual harness.** Write `/private/tmp/claude-501/-Users-rohnach29/2119e1c9-9ca6-4abd-8f26-27d2decf46b5/scratchpad/render-scenes.mts`:

```ts
import { writeFileSync } from "node:fs";
import { Rng } from "/Users/rohnach29/inkline/src/storytell/rng";
import { kidStrokes, renderScene, SCENE_H, SCENE_W } from "/Users/rohnach29/inkline/src/ink";
import { SCENES } from "/Users/rohnach29/inkline/src/ink/scenes/index";
import type { KidPose, SceneParams, SceneTag } from "/Users/rohnach29/inkline/src/ink";

const POSES: KidPose[] = ["running", "collapsed", "climbing", "sleeping", "looking-up", "dragging", "mid-air"];
const PARAM_TAGS = new Set<SceneTag>([
  "longest-run", "fastest-run", "hilliest-run", "night-runs", "streak", "quiet",
  "journey", "month", "false-starts", "route-champion", "hill-beast", "ghost-elevation",
]);
const SMALL: SceneParams = { km: 5, days: 4, count: 2, gainM: 40, paceMinPerKm: 7 };
const BIG: SceneParams = { km: 33, days: 21, count: 9, gainM: 480, paceMinPerKm: 4.5 };

function kidOnlySvg(pose: KidPose): string {
  const strokes = kidStrokes(pose, { x: 120, y: 170, scale: 2 }, new Rng(11).fork(pose), 0);
  const paths = strokes.map((s) => `<path d="${s.d}" class="${s.cls}" data-mode="${s.mode}"/>`).join("");
  return `<svg class="ink-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}">${paths}</svg>`;
}

const cells: string[] = [];
for (const pose of POSES) cells.push(`<div class="cell"><h3>kid:${pose}</h3>${kidOnlySvg(pose)}</div>`);
for (const tag of Object.keys(SCENES) as SceneTag[]) {
  const variants: Array<[string, SceneParams]> = PARAM_TAGS.has(tag)
    ? [["small", SMALL], ["large", BIG]]
    : [["", {}]];
  for (const [label, params] of variants) {
    const svg = renderScene(tag, params, new Rng(2026).fork(`shot:${tag}:${label}`));
    if (svg) cells.push(`<div class="cell"><h3>${tag}${label ? ` [${label}]` : ""}</h3>${svg}</div>`);
  }
}

const css = `
  body { margin: 0; font: 12px sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px; }
  .cell { border: 1px solid #8884; padding: 4px; } h3 { margin: 2px 0; font-size: 11px; }
  .light { background: #FAF6EC; --ink: #26211A; --ink-faint: #6F6759; --pencil: #4E525C; }
  .dark { background: #1C1F26; --ink: #E9E5DB; --ink-faint: #9A9EA8; --pencil: #BDB3A0; color: #eee; }
  .ink-scene { width: 100%; height: auto; color: var(--ink); }
  .ink-scene .s-ink { color: var(--ink); } .ink-scene .s-faint { color: var(--ink-faint); } .ink-scene .s-pencil { color: var(--pencil); }
  .ink-scene path[data-mode="centerline"] { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  .ink-scene path[data-mode="outline"] { fill: currentColor; stroke: none; }
`;
const html = `<!doctype html><style>${css}</style>
  <div class="light"><div class="grid">${cells.join("")}</div></div>
  <div class="dark"><div class="grid">${cells.join("")}</div></div>`;
writeFileSync("/private/tmp/claude-501/-Users-rohnach29/2119e1c9-9ca6-4abd-8f26-27d2decf46b5/scratchpad/scenes.html", html);
console.log(`wrote scenes.html: ${cells.length} cells x 2 themes`);
```

And `/private/tmp/claude-501/-Users-rohnach29/2119e1c9-9ca6-4abd-8f26-27d2decf46b5/scratchpad/scene-shots.mjs`:

```js
import { chromium } from "playwright-core";
const DIR = "/private/tmp/claude-501/-Users-rohnach29/2119e1c9-9ca6-4abd-8f26-27d2decf46b5/scratchpad";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto("file://" + DIR + "/scenes.html");
await page.locator(".light").screenshot({ path: DIR + "/scenes-light.png" });
await page.locator(".dark").screenshot({ path: DIR + "/scenes-dark.png" });
await browser.close();
console.log("wrote scenes-light.png / scenes-dark.png");
```

Run both: `npx tsx render-scenes.mts && node scene-shots.mjs` (from the scratchpad dir). Attach the PNG paths to your report.

- [ ] **Step 8: VISUAL GATE (controller).** The controller looks at the Kid in all 7 poses, both themes, and returns redraw notes (proportions, charm, recognizability). Iterate `SKELETONS`/constants until approved. This gate is part of THIS task.
- [ ] **Step 9: Commit** `git add src/ink src/render/theme.css && git commit -m "feat: the Kid rig, renderScene shell, and scene stroke styles"`.

---

### Task 4: Chapter scenes, batch 1 (the eight run-shaped tags)

**Files:**
- Create: `src/ink/scenes/first-run.ts`, `last-run.ts`, `longest-run.ts`, `fastest-run.ts`, `hilliest-run.ts`, `earliest-run.ts`, `latest-run.ts`, `night-runs.ts`
- Modify: `src/ink/scenes/index.ts` (register)
- Test: `src/ink/scenes.test.ts` (created here, grows in Tasks 5–6)

**Interfaces:**
- Consumes: `kidStrokes`, `strokePath`, `scribbleFill`, `hatchFill`, `SceneFn`, `SceneParams`, `SCENE_W/H`. Each module exports `const scene: SceneFn`.
- Produces: 8 registered scenes passing the scene test suite + the visual gate.

**The locked gags** (from the spec; staging refinable, concept not): first-run = Kid tiptoeing off the edge of a giant blank page; last-run = Kid closing an enormous door in the road, key in hand; longest-run = road rolls up behind the Kid like a ribbon off a giant reel (reel radius grows with `km`); fastest-run = shoes run ahead, Kid airborne holding the laces like reins (gap grows as `paceMinPerKm` drops); hilliest-run = hill so steep it folds over, Kid climbs the underside (height scales with `gainM`); earliest-run = Kid drags the sleeping sun up with a rope; latest-run = Kid walks a leashed crescent moon like a dog, streetlamp watching; night-runs = Kid runs across the sky hopping star to star (`count` stars, clamp 3–9).

**Composition rules (bind all scene tasks):**
- The Kid is in every scene and is drawn LAST (highest orders) except where the gag demands otherwise (e.g. a foreground fog may cover last).
- Ground/large shapes use `s-faint` or `s-pencil` + hatch; the Kid and the gag's punchline object use `s-ink`.
- Params clamp: define `const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));` locally or in the module; a missing param takes the gag's medium default.
- < 400 strokes/scene; stay inside the 240×200 viewBox with ≥8 units margin.

**Exemplar — this exact module ships as `night-runs.ts`** (the pattern every scene follows):

```ts
import type { Rng } from "../../storytell/rng";
import { kidStrokes } from "../kid";
import { strokePath } from "../stroke";
import { scribbleFill } from "../fills";
import type { OrderedStroke, Pt, SceneFn } from "../types";

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the Kid runs across the sky itself, hopping star to star */
export const scene: SceneFn = (params, rng) => {
  const strokes: OrderedStroke[] = [];
  let order = 0;
  const add = (d: string, mode: OrderedStroke["mode"], cls: OrderedStroke["cls"]): void => {
    strokes.push({ d, mode, cls, order: order++ });
  };

  // sleeping town silhouette along the bottom — faint
  const roofs: Pt[] = [
    { x: 10, y: 188 }, { x: 30, y: 176 }, { x: 44, y: 188 }, { x: 70, y: 188 },
    { x: 84, y: 170 }, { x: 100, y: 188 }, { x: 150, y: 188 }, { x: 166, y: 178 },
    { x: 182, y: 188 }, { x: 230, y: 188 },
  ];
  add(strokePath(roofs, "centerline", { wobble: 0.8 }, rng.fork("town")), "centerline", "s-faint");

  // stars as stepping stones arcing up-right; count from data
  const n = clamp(Math.round(params.count ?? 5), 3, 9);
  const stars: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    stars.push({ x: 26 + t * 180, y: 140 - Math.sin(t * Math.PI) * 60 - t * 14 });
  }
  for (const [i, s] of stars.entries()) {
    const r = 4 + rng.fork(`star:${i}`).next() * 2;
    add(strokePath([{ x: s.x - r, y: s.y }, { x: s.x + r, y: s.y }], "centerline", { wobble: 0.4 }, rng.fork(`sa:${i}`)), "centerline", "s-ink");
    add(strokePath([{ x: s.x, y: s.y - r }, { x: s.x, y: s.y + r }], "centerline", { wobble: 0.4 }, rng.fork(`sb:${i}`)), "centerline", "s-ink");
  }

  // faint dashed hop-arcs between consecutive stars
  for (let i = 0; i + 1 < stars.length; i++) {
    const a = stars[i]!;
    const b = stars[i + 1]!;
    const mid: Pt = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 14 };
    add(strokePath([a, mid, b], "centerline", { wobble: 0.5 }, rng.fork(`hop:${i}`)), "centerline", "s-pencil");
  }

  // a small moon watching, scribble-shaded
  add(strokePath(
    Array.from({ length: 15 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      return { x: 206 + Math.cos(a) * 13, y: 42 + Math.sin(a) * 13 };
    }),
    "centerline", { wobble: 0.9, overshoot: 3 }, rng.fork("moon")), "centerline", "s-ink");
  add(scribbleFill(
    Array.from({ length: 11 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return { x: 202 + Math.cos(a) * 8, y: 40 + Math.sin(a) * 8 };
    }),
    2.2, 0.6, rng.fork("moonshade")), "centerline", "s-faint");

  // the Kid, mid-hop off the middle star — drawn last
  const midStar = stars[Math.floor(stars.length / 2)]!;
  strokes.push(...kidStrokes("mid-air", { x: midStar.x + 8, y: midStar.y - 4, scale: 0.9 }, rng.fork("kid"), order));
  return strokes;
};
```

- [ ] **Step 1: Write the failing scene tests** (`src/ink/scenes.test.ts`, complete file — written to iterate whatever is registered, so it grows automatically through Task 6):

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../storytell/rng";
import { renderScene } from "./index";
import { SCENES } from "./scenes/index";
import type { SceneTag } from "./types";

const TAGS = Object.keys(SCENES) as SceneTag[];
const BIG = { km: 33, days: 21, count: 9, gainM: 480, paceMinPerKm: 4.4 };
const SMALL = { km: 4, days: 3, count: 2, gainM: 35, paceMinPerKm: 7.2 };
const PARAMETRIC: SceneTag[] = ["longest-run", "fastest-run", "hilliest-run", "night-runs"];

describe.each(TAGS)("scene %s", (tag) => {
  it("renders deterministically, non-empty, within budget", () => {
    const a = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    expect(a).toBe(renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`)));
    expect(a).toContain("<svg");
    const paths = a.match(/<path /g)!.length;
    expect(paths).toBeGreaterThan(5);
    expect(paths).toBeLessThan(400);
  });
  it("uses token classes only — no literal colors", () => {
    const svg = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(|stroke="[^c]|fill="[^cn]/);
    expect(svg).not.toContain("url(#wobble)");
  });
  it("stays inside the viewBox", () => {
    const svg = renderScene(tag, BIG, new Rng(5).fork(`t:${tag}`));
    const nums = svg.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // crude but effective: no coordinate far outside 240x200 (allow small negatives from wobble)
    for (const n of nums) expect(n).toBeGreaterThan(-12);
    expect(Math.max(...nums)).toBeLessThan(252);
  });
});

describe.each(PARAMETRIC.filter((t) => TAGS.includes(t)))("scene %s is data-driven", (tag) => {
  it("small vs large params change the drawing", () => {
    const s = renderScene(tag, SMALL, new Rng(5).fork(`p:${tag}`));
    const l = renderScene(tag, BIG, new Rng(5).fork(`p:${tag}`));
    expect(s).not.toBe(l);
  });
});
```

- [ ] **Step 2: Run to see the suite pass vacuously** (no scenes registered — `describe.each([])`), then author the 8 modules (exemplar ships verbatim as `night-runs.ts`). Register in `scenes/index.ts`:

```ts
import type { SceneFn, SceneTag } from "../types";
import { scene as firstRun } from "./first-run";
import { scene as lastRun } from "./last-run";
import { scene as longestRun } from "./longest-run";
import { scene as fastestRun } from "./fastest-run";
import { scene as hilliestRun } from "./hilliest-run";
import { scene as earliestRun } from "./earliest-run";
import { scene as latestRun } from "./latest-run";
import { scene as nightRuns } from "./night-runs";

export const SCENES: Partial<Record<SceneTag, SceneFn>> = {
  "first-run": firstRun,
  "last-run": lastRun,
  "longest-run": longestRun,
  "fastest-run": fastestRun,
  "hilliest-run": hilliestRun,
  "earliest-run": earliestRun,
  "latest-run": latestRun,
  "night-runs": nightRuns,
};
```

- [ ] **Step 3: Tests + typecheck green.** `npx vitest run src/ink && npx tsc --noEmit`.
- [ ] **Step 4: Render for the gate.** From the scratchpad dir: `npx tsx render-scenes.mts && node scene-shots.mjs`. Report the PNG paths.
- [ ] **Step 5: VISUAL GATE (controller).** Controller reviews every scene in both themes at small AND large params; returns redraw notes per scene; iterate until approved.
- [ ] **Step 6: Commit** `git add src/ink && git commit -m "feat: chapter scenes batch 1 — the eight run-shaped tags"`.

---

### Task 5: Chapter scenes, batch 2 (the eight pattern tags)

**Files:**
- Create: `src/ink/scenes/false-starts.ts`, `quiet.ts`, `streak.ts`, `journey.ts`, `month.ts`, `route-champion.ts`, `hill-beast.ts`, `ghost-elevation.ts`
- Modify: `src/ink/scenes/index.ts` (register — same alias pattern as Task 4)

**Interfaces:** identical contract to Task 4 (`export const scene: SceneFn`); `scenes.test.ts` picks the new tags up automatically; `PARAMETRIC` in that file gains `"streak", "quiet", "journey", "month", "false-starts", "route-champion", "hill-beast", "ghost-elevation"` (edit the array in this task — these are all data-driven).

**The locked gags:** false-starts = Kid tangled in a boulder-sized shoelace knot, one shoe on (knot size grows with `count`); quiet = Kid asleep in an armchair made of the giant empty shoe, dust motes, one cobweb line to the wall (motes/web density grows with `days`); streak = Kid marching chest-out trailing chalk X-marks to the horizon (`days` X's, clamp 3–21, perspective-shrinking); journey = Kid rides a paper plane bareback over a tiny curved earth, dotted wake behind (wake length grows with `km`); month = Kid buried to the waist in torn-off calendar days, still running (leaf count with `km`); route-champion = Kid wears a loop of road as a crown, arms raised (`count` laps drawn as crown loops, clamp 2–6); hill-beast = the hill is a sleeping beast with a switchback spine, Kid on its snout planting a flag (beast height with `gainM`); ghost-elevation = translucent staircase to nowhere (all `s-pencil`), Kid halfway up looking back at the reader (steps with `gainM`, clamp 5–12).

Composition rules, clamp helper, stroke budget, Kid-drawn-last: identical to Task 4 (its rules section binds here verbatim).

- [ ] **Step 1: Author the 8 modules** following the Task 4 exemplar pattern (`night-runs.ts` is in the tree — read it first).
- [ ] **Step 2: Register all 8** in `scenes/index.ts`; extend `PARAMETRIC` in `scenes.test.ts` as above.
- [ ] **Step 3: Tests + typecheck green.** `npx vitest run src/ink && npx tsc --noEmit`.
- [ ] **Step 4: Render for the gate**: `npx tsx render-scenes.mts && node scene-shots.mjs`; report PNG paths.
- [ ] **Step 5: VISUAL GATE (controller)** — iterate until approved.
- [ ] **Step 6: Commit** `git add src/ink && git commit -m "feat: chapter scenes batch 2 — the eight pattern tags"`.

---

### Task 6: Beast portraits and the cover

**Files:**
- Create: `src/ink/scenes/beast-quiet.ts`, `beast-hill.ts`, `beast-night.ts`, `beast-false-start.ts`, `beast-ghost.ts`, `cover.ts`
- Modify: `src/ink/scenes/index.ts` (register `"beast-quiet"`, `"beast-hill"`, `"beast-night"`, `"beast-false-start"`, `"beast-ghost"`, `"cover"`)

**Interfaces:** same `SceneFn` contract. Beast portraits take no meaningful params (`params` ignored); they are PORTRAITS — the beast fills the frame, the Kid appears small (bottom corner, `scale ≈ 0.55`, reacting: peeking, offering a shoe, tipping a cap — pick per portrait).

**The locked gags:** beast-quiet = huge soft blob with heavy-lidded eyes absorbing an armchair; beast-hill = the hill-beast mid-yawn, switchback teeth; beast-night = long-armed creature made of streetlamp light and moths; beast-false-start = small gremlin proudly holding a stolen left shoe; beast-ghost = politely floating sheet wearing running shoes, mid-stride; cover = the Kid running along the book's own title rule-line as if it were pavement (a long horizontal line at y≈150, Kid `running` on top of it, a few speed dashes and one flying leaf).

Composition rules identical to Task 4, except: in beast portraits the BEAST is `s-ink` and drawn last after the Kid (the beast is the punchline); cover keeps the Kid last.

- [ ] **Step 1: Author the 6 modules** (read two Task 4/5 modules first for the pattern).
- [ ] **Step 2: Register**; `scenes.test.ts` picks them up automatically (they are not in `PARAMETRIC`).
- [ ] **Step 3: Tests + typecheck green.** `npx vitest run src/ink && npx tsc --noEmit`.
- [ ] **Step 4: Render for the gate**; report PNG paths.
- [ ] **Step 5: VISUAL GATE (controller)** — iterate until approved. All 22 scenes + 7 poses now exist; the controller does a full-grid pass.
- [ ] **Step 6: Commit** `git add src/ink && git commit -m "feat: beast portraits and cover scene"`.

---

### Task 7: Integration — scenes into the Book, doodles retired, draw-in upgrade

**Files:**
- Modify: `src/storytell/types.ts` (Chapter + BeastEntry), `src/storytell/book.ts`, `src/render/pages.ts`, `src/render/theme.css`, `src/living/index.ts`
- Create: `src/living/scene-reveal.ts`
- Delete: `src/render/doodles.ts`, `src/render/doodles.test.ts`
- Test: `src/storytell/book.test.ts` (+ snapshot regen), `src/render/pages.test.ts`

**Interfaces:**
- Consumes: `renderScene`, `SceneParams` from `../ink`; `Rng` from storytell.
- Produces: `Chapter.sceneParams: Record<string, number>` (replaces `doodleTags: string[]`; the chapter's scene tag IS `chapter.eventType`); `BeastEntry` loses `doodleTag` (beast scene tag derives from `kind`: `beast-${kind}`); pages markup contract: every chapter section contains exactly one `.scene-area > svg.ink-scene`; cover contains one; each beast entry contains one.

- [ ] **Step 1: Flip the model tests.** In `book.test.ts`: replace `doodleTags` expectations with `sceneParams` (a `Record<string,number>`; for a longest-run chapter expect `sceneParams.km` to be a number). In `pages.test.ts`: replace doodle assertions with:

```ts
it("renders one ink scene per chapter, on the cover, and per beast", () => {
  const html = renderBook(book, year);
  const sceneCount = (html.match(/class="ink-scene"/g) ?? []).length;
  expect(sceneCount).toBe(book.chapters.length + 1 + book.beasts.length);
  expect(html).not.toContain("ink-doodle");
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Model change.** `types.ts`: `doodleTags: string[]` → `sceneParams: Record<string, number>`; delete `doodleTag: string` from `BeastEntry`. `book.ts`: delete the `DOODLE_TAGS` map; add and use:

```ts
function sceneParamsFor(event: StoryEvent): Record<string, number> {
  const d = event.data;
  const out: Record<string, number> = {};
  const keys: Array<[string, string]> = [
    ["km", "km"], ["days", "days"], ["count", "count"],
    ["gainM", "gainM"], ["elevationGainM", "gainM"], ["paceMinPerKm", "paceMinPerKm"],
  ];
  for (const [from, to] of keys) {
    if (from in d && out[to] === undefined) out[to] = Number(d[from]);
  }
  return out;
}
```

In the chapter literal: `sceneParams: sceneParamsFor(event),` replacing `doodleTags`. In `beastFor` call sites, drop the doodleTag argument/field.

- [ ] **Step 4: Render change.** `pages.ts`:
  - Remove `doodleFor` import, `firstDoodle`, `DoodlePick`, `FALLBACK_DOODLE_TAG`; import `{ renderScene } from "../ink"`, `{ Rng } from "../storytell/rng"` and `type { SceneParams } from "../ink"`.
  - `renderBook` creates `const rng = new Rng(book.seed);` and threads it (pass to the per-page renderers that need it).
  - `renderMapArea(mapSpec, year)` now returns `""` when there is no usable route/flight svg (drop the doodle fallback path and `usedTagIndex` machinery).
  - `renderChapter` appends after the stats `<dl>`: `<div class="scene-area">${renderScene(chapter.eventType, chapter.sceneParams as SceneParams, rng.fork(`scene:${chapter.id}`))}</div>` (remove the doodle strip entirely).
  - `renderCover`: `<div class="cover-doodle">` becomes `<div class="cover-scene">${renderScene("cover", {}, rng.fork("scene:cover"))}</div>`.
  - `renderBeasts`: each entry renders `renderScene(`beast-${b.kind}`, {}, rng.fork(`scene:beast:${b.name}`))` in place of the doodle.
  - Delete `src/render/doodles.ts` + `doodles.test.ts` (`git rm`).
- [ ] **Step 5: CSS.** In `theme.css`: replace the `.ink-doodle` rule group (stroke styling block + the `.map-area .ink-doodle` / `.doodle-strip .ink-doodle` / `.beast-entry .ink-doodle` sizing rules) with sizing for scenes (keep the Plan-G stroke classes from Task 3):

```css
.scene-area { max-width: 340px; margin: 1.2rem auto 0; }
.cover-scene { max-width: 380px; margin: 2rem auto 0; }
.beast-entry .ink-scene { max-width: 200px; }
```

Grep `ink-doodle` and `doodle-strip` across `src/` afterward — zero references.

- [ ] **Step 6: Draw-in upgrade.** Create `src/living/scene-reveal.ts`:

```ts
/** Per-stroke draw-in for ink scenes: centerline strokes draw via
 *  stroke-dash animation, outline strokes fade in, both staggered in
 *  data-order sequence. Runs once per section on first reveal; the
 *  animated layer only installs when reduced motion is off. */
const TOTAL_MS = 2400;
const PER_STROKE_MS = 420;

export function revealScene(section: HTMLElement): (() => void) | undefined {
  const svg = section.querySelector<SVGSVGElement>("svg.ink-scene");
  if (!svg || svg.dataset.revealed === "1") return undefined;
  svg.dataset.revealed = "1";
  const paths = [...svg.querySelectorAll<SVGPathElement>("path")].sort(
    (a, b) => Number(a.dataset.order ?? 0) - Number(b.dataset.order ?? 0),
  );
  if (paths.length === 0) return undefined;
  const stagger = Math.max(24, (TOTAL_MS - PER_STROKE_MS) / paths.length);
  const timers: number[] = [];
  for (const [i, p] of paths.entries()) {
    if (p.dataset.mode === "centerline") {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transition = `stroke-dashoffset ${PER_STROKE_MS}ms ease-out`;
    } else {
      p.style.opacity = "0";
      p.style.transition = `opacity ${Math.round(PER_STROKE_MS * 0.6)}ms ease-out`;
    }
    timers.push(
      window.setTimeout(() => {
        p.style.strokeDashoffset = "0";
        p.style.opacity = "1";
      }, Math.round(i * stagger)),
    );
  }
  return () => {
    for (const t of timers) window.clearTimeout(t);
    for (const p of paths) {
      p.style.strokeDasharray = "";
      p.style.strokeDashoffset = "";
      p.style.opacity = "";
      p.style.transition = "";
    }
  };
}
```

In `src/living/index.ts`: `import { revealScene } from "./scene-reveal";` and add `revealScene` to the `CHAPTER_REVEALERS` array. NOTE: `CHAPTER_REVEALERS` entries take `(section, soundHooks?)` — `revealScene` ignores the second argument; its signature is compatible as written. Also extend the observer so the beasts page and cover get scene reveals if `installAnimatedLayer` currently only observes `.page-chapter` sections — check the selector it observes and widen it to include `.page-beasts` and `.page-cover` (scenes there should draw in too; if the observer is chapter-specific, observe those two pages with the same handler).

- [ ] **Step 7: Regenerate the golden.** `npx vitest run src/storytell/book.test.ts -u`; eyeball the snapshot diff (doodleTags → sceneParams with plausible numbers).
- [ ] **Step 8: Full verification.** `npx tsc --noEmit` → 0. `npx vitest run` → all pass. `npx vite build` → success.
- [ ] **Step 9: Commit** `git add -A && git commit -m "feat!: ink scenes replace doodles — Kid in every illustration, per-stroke draw-in"`.

---

## Final gates (controller-run, after Task 7)

1. Full suite + typecheck + build green.
2. Whole-branch review (most capable model): engine math, determinism seams, reveal lifecycle (cancel/teardown, share-PNG interplay), scene registry completeness (all 22 tags), CSS token discipline in both themes.
3. Full visual pass: the demo book in headless Chrome — every chapter scene, cover, beasts, light + dark screenshots reviewed by eye; draw-in observed (dashoffset decreasing, stagger visible); reduced-motion pass (scenes fully visible immediately, no reveal classes); share-PNG of a scene chapter downloaded and inspected (strokes present, no wobble-filter dependency); print spot-check.
4. Real-export acceptance: user's export rendered; scenes reflect real data (480 m ghost staircase taller than demo's, 21-day streak trails more X's).
5. Merge to main + push only when all green.

## Self-Review (author's check)

- Spec coverage: engine (T1–2) ✅ · Kid rig ✅ (T3) · 16 chapter scenes ✅ (T4–5) · 5 beasts + cover ✅ (T6) · data-driven params ✅ (sceneParamsFor + PARAMETRIC tests) · draw-in ordered, character last ✅ (order convention + revealScene) · visual gate every scene task ✅ · doodles retired ✅ (T7) · both themes/tokens ✅ · determinism forks ✅ · share/print/reduced-motion ✅ (final gates; reveal styles are inline JS, reduced motion never installs the animated layer).
- Placeholders: none — engine/rig/exemplar/integration code complete; scene authoring tasks carry a complete exemplar + locked gag list + binding composition rules.
- Type consistency: `SceneFn(params, rng)` used by registry, renderScene, tests; `kidStrokes(pose, opts, rng, orderBase)` consistent T3–T6; `sceneParams: Record<string, number>` cast to `SceneParams` at the render boundary (safe: SceneParams is all-optional numbers).
