# Plan D — Living Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the book alive on screen — self-drawing ink led by a stick-figure runner, data-keyed atmosphere particles, living beast doodles, an animated flight arc, a 3D cover-open, share-a-page PNG, a TOC ribbon, and optional pencil sound — all absent in print and fully degraded under `prefers-reduced-motion`.

**Architecture:** New `src/living/` package. Every module splits PURE, unit-testable logic (durations, particle specs, path math, encoders) from thin DOM/rAF glue. `initLivingBook(bookRoot)` is the single entry, called by the app shell after `renderBook`; it reads `data-*` attributes the renderer emits (no coupling to the Book object). All effects are screen-only enhancements: the static book must remain 100% functional with `src/living` never loaded.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess`, Vitest, vanilla DOM/Canvas/WebAudio/rAF. NO new dependencies (runtime OR dev).

## Global Constraints

- Core artifact stays deterministic: `src/render` and upstream keep the no-`Math.random()` law. **Exception, explicitly scoped:** `src/living/**` MAY use `Math.random()` for ephemeral visual effects (particles, wiggle phases) — they are screen-only and never serialized. `Date.now()`/`performance.now()` allowed in `src/living` for animation timing only.
- `prefers-reduced-motion: reduce` → `initLivingBook` installs NOTHING animated: no observers that animate, no particles, no runner, no cover transform, no sound. Share-PNG and TOC (functional, non-animated) still work. One global check, tested.
- Print: all living-layer DOM (canvas overlay, runner, TOC ribbon, sound toggle) carries class `no-print`; CSS already hides `.no-print` in print.
- Zero network. No new deps. In-voice copy for all new UI strings. `esc()` for any data-derived string.
- Frame budget: atmosphere ≤ 4 ms/frame on a midrange laptop — enforced by design: particle counts capped per spec below; if `document.hidden` pause everything; degrade to none when `navigator.hardwareConcurrency <= 2`.
- Animation CSS lives in `src/render/theme.css` (book classes) or `src/app/shell.css` (chrome) following the established split; keep declarations token-based.
- Tests colocated; pure functions tested; DOM glue verified by the controller's headless-Chrome acceptance. Commit style unchanged (trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

## File Structure

```
src/living/
  timing.ts      pure: drawDurationMs(paceMinPerKm), stagger math
  reveal.ts      IntersectionObserver + stroke-dashoffset draw-in + runner glue
  particles.ts   pure: ParticleSpec per atmosphere tag, spawn/step functions
  atmosphere.ts  canvas overlay glue driving particles.ts
  beasts.ts      hover/tap micro-animation glue (CSS-class triggers)
  flight.ts      flight-arc draw-in + plane dot along the arc
  cover3d.ts     landing-cover lift/open transforms (app shell hook)
  share.ts       pure svg→dataURI helpers + share-page-as-PNG glue
  toc.ts         table-of-contents ribbon build + scroll spy
  sound.ts       pure synth params + WebAudio pencil-scratch glue, toggle
  index.ts       initLivingBook(root: HTMLElement): () => void  (returns teardown)
```

---

### Task D1: Self-drawing ink + runner (`timing.ts`, `reveal.ts`, `index.ts`, renderer data hooks)

**Files:**
- Create: `src/living/timing.ts`, `src/living/timing.test.ts`, `src/living/reveal.ts`, `src/living/index.ts`
- Modify: `src/render/pages.ts` (emit `data-draw-ms` on each route `.ink-map` svg: renderer computes run pace `minutes/km` from the year lookup it already does; call `drawDurationMs` — import from `../living/timing` is NOT allowed (render must not depend on living); instead DUPLICATE the constant mapping? NO — put `drawDurationMs` in `src/render/svg.ts` as pure export `drawDurationMs(paceMinPerKm: number | null): number` and have living/timing re-export it. Render emits the attribute; living reads it.)
- Modify: `src/render/svg.test.ts` (tests for drawDurationMs), `src/app/main.ts` (call `initLivingBook` after book render; store teardown; call teardown on start-over), `src/render/theme.css` (runner + reveal classes)

**Exact behaviors:**
- `drawDurationMs(pace)`: maps pace (min/km) linearly from [3.5 → 2000ms] to [9.0 → 6000ms], clamped to [2000, 6000]; `null`/non-finite/≤0 pace → 3500. Round to integer.
- pages.ts: route maps get `data-draw-ms="{n}"`; flight maps get `data-draw-ms="4000"`.
- `initLivingBook(root)`: if reduced motion → return no-op teardown immediately (still no TOC here — D4 adds TOC separately with its own reduced-motion-safe path). Else set up one IntersectionObserver (threshold 0.35) over `.page-chapter` sections.
- On first intersection of a chapter with an `.ink-map`: the route path (`.ink-route`) draws in over its `data-draw-ms`: JS sets `strokeDasharray = strokeDashoffset = path.getTotalLength()`, forces layout, then adds class `is-drawing` (CSS transition `stroke-dashoffset <duration> linear` — duration set via inline style `transition-duration`). Runner: a tiny stick figure (hand-authored 5-stroke SVG group `<g class="ink-runner">`, ~14px) appended into the map svg, positioned each rAF via `path.getPointAtLength(progress * total)` while drawing; removed (fade via class) 300ms after completion. Chapters re-entering the viewport do NOT redraw (a `WeakSet` of done sections).
- Teardown disconnects observers, cancels rAF, removes runners.

- [ ] Steps: failing tests for `drawDurationMs` (mapping endpoints, clamp both sides, null/garbage → 3500, integer) + pages.test additions (`data-draw-ms` present on route maps, equals drawDurationMs of that run's pace; flight maps get 4000) → implement → full suite + typecheck + build green → commit `feat: self-drawing ink with pace-true durations`.

---

### Task D2: Atmosphere particles (`particles.ts`, `atmosphere.ts`)

**Files:**
- Create: `src/living/particles.ts`, `src/living/particles.test.ts`, `src/living/atmosphere.ts`
- Modify: `src/living/index.ts` (wire), `src/app/shell.css` (canvas overlay positioning `.atmosphere-canvas`)

**Exact behaviors (pure layer — `particles.ts`):**
```ts
export type AtmoTag = "monsoon" | "fireflies" | "leaves" | "snow";
export interface ParticleSpec { count: number; speedY: [number, number]; speedX: [number, number]; size: [number, number]; alpha: [number, number]; flicker: boolean }
export function specFor(tag: string): ParticleSpec | null;  // unknown → null
export interface P { x: number; y: number; vx: number; vy: number; size: number; alpha: number; phase: number }
export function spawn(spec: ParticleSpec, w: number, h: number, rand: () => number): P[];
export function step(ps: P[], spec: ParticleSpec, w: number, h: number, dtMs: number): void; // mutates; wraps at edges; flicker = alpha oscillates via phase
```
Specs (ink-fleck monochrome, sparse): monsoon {count 90, vy [140,260]px/s, vx [-30,-10], size [1,2], alpha [.18,.35], flicker false} (drizzle streaks — atmosphere.ts draws 6px lines along velocity); fireflies {count 14, vy [-8,8], vx [-12,12], size [1.5,2.5], alpha [.05,.55], flicker true}; leaves {count 18, vy [22,50], vx [-25,25], size [2.5,4.5], alpha [.25,.45], flicker false, drawn as small tilted strokes}; snow {count 45, vy [18,40], vx [-12,12], size [1.5,3], alpha [.25,.5], flicker false}.
- `atmosphere.ts`: ONE fixed-position canvas (class `atmosphere-canvas no-print`, pointer-events none, z-index above desk below toolbar). Each rAF: find the `.page-chapter` most visible in viewport; its `data-atmosphere` first tag drives the active system; tag changes cross-fade over 600ms (alpha ramp). Ink color from computed `--ink` of body (re-read on theme change via MutationObserver on `documentElement[data-theme]`). Pause when `document.hidden`. Skip entirely when `hardwareConcurrency <= 2`.

- [ ] Steps: failing tests for `specFor` (4 tags exact counts, unknown → null), `spawn` (count, ranges respected with seeded fake rand, within bounds), `step` (moves by vt, wraps edges, flicker oscillates alpha within range, dt-proportional) → implement → suite/typecheck/build green → commit `feat: atmosphere - monsoon, fireflies, leaves, snow`.

---

### Task D3: Living beasts + flight arc + cover open (`beasts.ts`, `flight.ts`, `cover3d.ts`)

**Files:**
- Create: `src/living/beasts.ts`, `src/living/flight.ts`, `src/living/cover3d.ts`, `src/living/beasts.test.ts`
- Modify: `src/living/index.ts`, `src/app/main.ts` (cover3d hook on landing screen), `src/render/theme.css` + `src/app/shell.css` (animation keyframes/classes)

**Exact behaviors:**
- `beasts.ts`: for each `.ink-doodle` inside `.page-beasts` and `.doodle-strip`: on `mouseenter`/`click`, add class `is-alive` for 1400ms (re-triggerable after it ends, not during). CSS (theme.css): `@keyframes doodle-wiggle` — subtle rotate(-2deg→2.5deg→-1deg) + translateY(-3px) with transform-origin center bottom; `.ink-doodle.is-alive { animation: doodle-wiggle 1.4s ease-in-out; }`. Ghost doodles additionally get `@keyframes ghost-drift` (float up 4px + opacity dip) via `.ink-doodle[data-tag="ghost"].is-alive` — requires doodles.ts to emit `data-tag="{tag}"` on the svg root (modify `src/render/doodles.ts` + its test).
- Pure export for testability: `export function wireBeast(el: Element, now: () => number): (type: "enter") => boolean` — returns whether the trigger fired (false while already alive). Test with fake clock.
- `flight.ts`: on chapter intersection (reuse D1's observer via a callback registry in index.ts), `.ink-arc` draws in like routes (dasharray trick, 2500ms) and a 3px ink dot travels the arc once; graticule/globe fade in first (300ms stagger, CSS classes).
- `cover3d.ts`: landing cover only. `dragover` on drop zone → class `lift` (perspective(1200px) rotateX(4deg) translateY(-6px), shadow deepens). `drop` → class `open` (rotateY(-24deg) skewed page-turn feel over 500ms) before the app swaps to progress screen (main.ts awaits a 500ms promise from cover3d before rendering progress — but ONLY when not reduced-motion). Export pure `coverClassFor(evt: "over" | "leave" | "drop"): string` trivially tested; glue thin.

- [ ] Steps: failing tests (wireBeast fake-clock retrigger logic; coverClassFor mapping; doodles emit data-tag — extend doodles.test) → implement → green gates → commit `feat: living beasts, flight arc, cover open`.

---

### Task D4: Share-a-page PNG + TOC ribbon (`share.ts`, `toc.ts`)

**Files:**
- Create: `src/living/share.ts`, `src/living/share.test.ts`, `src/living/toc.ts`
- Modify: `src/living/index.ts`, `src/app/main.ts` (toolbar gets nothing new — share buttons are per-page), `src/app/shell.css` + `src/render/theme.css`

**Exact behaviors:**
- Every `.page` gets a small `share-btn no-print` button (bottom-right corner, handwriting face, label "keep this page") injected by `toc.ts`... no — injected by `share.ts` wiring in index.ts. Click → rasterize THAT page: clone the section into a standalone SVG `foreignObject` approach is flaky; instead use the reliable path: serialize the section's outerHTML into `<svg xmlns…><foreignObject width height>…` with inlined CSS variables resolved (read computed styles for the token set and inline them on the clone root), `new Image()` from `data:image/svg+xml;charset=utf-8,` + encodeURIComponent, draw to canvas at 2x, `canvas.toBlob` → `URL.createObjectURL` → temporary `<a download="inkline-{data-page}.png">` click. On failure (tainted canvas etc.) → in-voice alertless fallback: button text flips to "this page refused to be kept" for 2s (console.error real error).
- Pure exports tested: `pageFileName(dataPage: string | null): string` ("inkline-ch-3.png", null → "inkline-page.png"); `svgShell(w: number, h: number, inner: string): string` (exact svg+foreignObject wrapper, xmlns correct, inner passed through — test structure + dimensions); `inlineTokens(tokens: Record<string,string>): string` (style attr string).
- `toc.ts`: fixed left-edge ribbon (`.toc-ribbon no-print`, collapsed to a 10px ink spine; hover/focus expands to a list). Entries: every `.page-chapter`'s kicker+title (esc'd text pulled from DOM), click → scrollIntoView smooth (instant under reduced motion). Scroll-spy: highlight current via the D1 observer registry (or its own cheap observer under reduced motion — TOC works in reduced motion, animations don't). Keyboard accessible (real `<button>`s).

- [ ] Steps: failing tests (pageFileName, svgShell, inlineTokens) → implement → gates green → commit `feat: share-a-page PNG and TOC ribbon`.

---

### Task D5: Pencil sound (`sound.ts`)

**Files:**
- Create: `src/living/sound.ts`, `src/living/sound.test.ts`
- Modify: `src/living/index.ts` (draw-start/draw-end hooks), `src/app/main.ts` (toolbar "sound: off" toggle button, persisted `localStorage.inkline-sound`, default OFF always), `src/app/shell.css`

**Exact behaviors:**
- Synthesized only, no assets: pencil scratch = white noise through a bandpass (center ~1800Hz, Q ~0.8) + lowpass, amplitude follows a subtle 8–14Hz tremor LFO; gain envelope 80ms attack, sustained during draw, 150ms release. Page-turn whoosh (on keyboard nav): filtered noise burst 220ms, bandpass sweep 400→900Hz.
- Pure exports tested: `scratchParams(drawMs: number): { attackMs: 80, releaseMs: 150, bandpassHz: number, tremorHz: number }` (bandpass 1600–2000 varying by drawMs hash-like formula — deterministic given drawMs; tremor 8–14 same); `whooshParams(): fixed object`. Glue (`attachSound`) creates AudioContext lazily on first ENABLE (never before user opts in — autoplay policy + politeness), suspends on toggle-off, resumes on toggle-on.
- Toggle label cycles "sound: off" / "sound: on (pencil)". Default off; reduced-motion does NOT disable sound (it's audio, not motion) but sound only plays alongside draws, which don't run under reduced motion — so effectively silent there; acceptable.

- [ ] Steps: failing tests (scratchParams determinism + ranges + exact envelope constants; whooshParams shape) → implement → gates green → commit `feat: pencil sound, off by default`.

---

## Acceptance (controller, after all tasks)

Headless-Chrome (scratchpad playwright harness): demo book — route paths start hidden and finish drawn (`stroke-dashoffset` reaches 0), runner appears then fades; atmosphere canvas present with monsoon active on a Mumbai chapter and fireflies on the night chapter; beast doodle animates on hover (class toggles); flight arc draws; share button downloads a PNG (intercept download, verify non-trivial byte length + PNG magic); TOC ribbon lists all chapters and navigates; sound toggle flips label and creates AudioContext only after enable; `prefers-reduced-motion` emulation → no `is-drawing` classes ever appear, no canvas, book fully readable; print emulation unchanged from Plan C. Real routes-only zip spot check. Screenshots reviewed by controller.
