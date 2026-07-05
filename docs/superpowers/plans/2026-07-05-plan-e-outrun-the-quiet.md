# Plan E — "Outrun the Quiet" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-button canvas doodle-runner in the back of the book: you run your year's real elevation profiles while The Quiet — a paper-colored fog that un-draws the world — chases from the left. Beasts from your own book are the obstacles. Death is charming: a hand-drawn score card with a one-line poem, exportable as PNG.

**Architecture:** `src/game/` mirrors the living-layer discipline: pure, deterministically-testable core (`terrain`, `physics`, `spawn`, `scorecard`) + thin canvas/rAF glue (`draw`, `game`). Physics runs on a fixed 120 Hz tick under an accumulator, so the same input script produces the same run on any machine. The game page is rendered by the book (back matter) and also reachable via `#game` with demo data.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess`, Vitest, vanilla Canvas 2D. NO new dependencies.

## Global Constraints

- Deterministic core: `terrain/physics/spawn/scorecard` are pure — no `Date.now`, no `Math.random`, no rAF. All randomness via `Rng` (from `src/storytell`) seeded from `seedFromYear(year)`. Fixed tick `TICK_MS = 1000/120`. Same seed + same input sequence ⇒ identical state trace (tested).
- Glue (`draw.ts`, `game.ts`) may use rAF/performance.now/Math.random (visual flourish only, never game state).
- Aesthetic: identical ink-on-paper language — tokens from CSS (`--paper/--ink/--pencil` read via getComputedStyle at init and on theme change), wobbly strokes, doodle beasts. The game must look like a page that came alive.
- In-voice copy everywhere; honesty rule for the score card (real numbers only). `esc()` for data-derived strings in SVG/DOM.
- Screen-only: game canvas + controls carry `no-print`. `prefers-reduced-motion`: the game still WORKS (it's interactive, not decorative — user gesture starts it) but the idle attract-mode animation does not auto-play; fog edge noise flourish disabled.
- Zero network; no new deps; tests colocated; commit trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
src/game/
  terrain.ts    stitchTerrain, groundYAt — real elevation → runnable ground
  physics.ts    GameState, step() — fixed-tick simulation
  spawn.ts      obstacles from Book beasts, seeded placement
  scorecard.ts  score copy + pure SVG card builder
  draw.ts       canvas ink rendering (terrain, runner, beasts, fog)
  game.ts       loop glue: accumulator, input, lifecycle
  index.ts      initGame(container, year, book): GameHandle
```

---

### Task E1: Terrain + physics (`src/game/terrain.ts`, `src/game/physics.ts`)

**Files:** Create: `terrain.ts`, `terrain.test.ts`, `physics.ts`, `physics.test.ts` (all under `src/game/`)

**Interfaces (Produces):**

```ts
// terrain.ts
export interface TerrainPoint { xM: number; elevM: number }  // xM = cumulative meters along the year
/** Stitch tracked runs chronologically into one profile.
 *  Per run: walk track points, xM advances by horizontal haversine distance
 *  between consecutive points, elevM = point ele. Runs are DOWNSAMPLED first
 *  (ingest downsample, tolerance 8). Between runs insert a flat 200 m bridge
 *  at the previous run's final elevation (the rest day). Elevation is
 *  RE-BASED per run: run's first ele maps to previous segment's end ele
 *  (no cliffs between Mumbai sea level and Indiana). Runs without tracks or
 *  with < 2 points are skipped. Empty input → single flat segment
 *  [{0,0},{2000,0}] (demo-proof). Output x strictly increasing. */
export function stitchTerrain(runs: readonly Run[]): TerrainPoint[];
/** Linear interpolation of elevM at xM; clamps to ends. */
export function elevAt(terrain: readonly TerrainPoint[], xM: number): number;
/** Total length in meters. */
export function terrainLengthM(terrain: readonly TerrainPoint[]): number;

// physics.ts
export const TICK_MS: number;            // 1000 / 120
export const RUN_SPEED_M_S = 4.2;        // runner auto-run speed (game-meters/s)
export const QUIET_BASE_M_S = 3.6;       // fog base speed
export const QUIET_CATCHUP_M_S = 5.4;    // fog speed while player is grounded-idle after a landing longer than 1.5s? NO — simpler rule below
export const JUMP_V = 7.2;               // m/s upward
export const GRAVITY = 22;               // m/s^2 downward
export interface GameInput { jumpPressed: boolean }  // edge-triggered per tick
export interface GameState {
  tick: number; xM: number; yM: number;  // yM = height above ground line (0 = on ground)
  vyM: number; grounded: boolean;
  quietXM: number;                       // fog front position
  stumbleUntilTick: number;              // > tick ⇒ speed halved (obstacle hit)
  alive: boolean;
}
export function initialState(): GameState;   // x=40 head start... exact: xM 40, quietXM 0, grounded true, alive true
/** One fixed tick. Rules:
 *  - dt = TICK_MS/1000. xM += speed*dt where speed = RUN_SPEED halved while tick < stumbleUntilTick.
 *  - Jump: if grounded && input.jumpPressed → vyM = JUMP_V, grounded=false.
 *  - Air: vyM -= GRAVITY*dt; yM += vyM*dt; if yM <= 0 → yM=0, vyM=0, grounded=true.
 *    (Ground is the terrain LINE; jumping is over obstacles, terrain slope is cosmetic — the runner sticks to ground line via yM offset.)
 *  - Quiet: quietXM += QUIET_BASE_M_S*dt, PLUS catch-up: if (xM - quietXM) > 120 the fog speeds to QUIET_CATCHUP until gap <= 120 (rubber band keeps tension).
 *  - alive = quietXM < xM. Once !alive, state freezes (step returns same state).
 *  Collision with obstacles lives in spawn.ts/consumers (Task E2) via hitTest — physics stays obstacle-agnostic except stumbleUntilTick which callers set. */
export function step(s: GameState, input: GameInput): GameState;  // returns NEW object, no mutation
/** Convenience: run N ticks with a scripted input sequence (tests + attract mode). */
export function simulate(s: GameState, script: readonly GameInput[]): GameState;
```

- [ ] Failing tests: stitchTerrain — two fake runs (mkTrack helper as in analyze tests) produce strictly-increasing xM; re-basing removes the cliff (second run starting at ele 500 continues from first run's end ele); 200 m bridge present; trackless runs skipped; empty → the exact flat default; elevAt interpolates midpoints and clamps; terrainLengthM. physics — jump only when grounded; apex ≈ JUMP_V²/(2·GRAVITY) within 5% via tick simulation; lands back at yM 0 grounded; stumble halves speed for exactly the stated window; fog base advance per tick exact; rubber-band engages only when gap > 120 and disengages at ≤ 120; death freeze (step after !alive returns identical state, tick included); determinism — two `simulate` runs with the same 2000-tick script produce identical final states (deep equal), and a differing script differs.
- [ ] Implement → full suite + typecheck + build green → commit `feat: game terrain and fixed-tick physics`.

---

### Task E2: Obstacles + score card (`src/game/spawn.ts`, `src/game/scorecard.ts`)

**Files:** Create: `spawn.ts`, `spawn.test.ts`, `scorecard.ts`, `scorecard.test.ts`

**Interfaces (Consumes:** `Rng`/`hashString`/`seedFromYear` from `src/storytell`; `BeastEntry`, `Book` types; `esc`, `svgShell` NOT reused — scorecard builds plain SVG (no foreignObject). **Produces):**

```ts
// spawn.ts
export interface Obstacle { xM: number; kind: BeastEntry["kind"]; widthM: number; heightM: number; name: string }
/** Deterministic layout: fork rng with "game:spawn". Obstacles drawn from the
 *  book's beasts (cycle through them); first at xM 160, then gaps drawn from
 *  [90, 220] via rng; stop when xM > terrainLength - 100. Sizes by kind:
 *  quiet {w 18, h 10} (snoozing lump), false-start {w 8, h 6} (banana),
 *  hill {w 26, h 16}, night {w 14, h 12} (crescent lump), ghost {w 12, h 14}.
 *  Book with zero beasts → generic "pebble" obstacles kind "false-start"
 *  named "A Pebble of Doubt" same rhythm. */
export function spawnObstacles(rng: Rng, beasts: readonly BeastEntry[], terrainLengthM: number): Obstacle[];
/** AABB-ish: hit if runner (at xM, height yM, body w 6 h 10) overlaps obstacle
 *  and yM < obstacle.heightM (jumping clears it). Returns the obstacle hit or null. */
export function hitTest(xM: number, yM: number, obstacles: readonly Obstacle[]): Obstacle | null;
/** Obstacles the fog has swallowed are gone (no double jeopardy). */
export function alive(obstacles: readonly Obstacle[], quietXM: number): Obstacle[];

// scorecard.ts
export interface ScoreFacts { kmSurvived: number; realKm: number; beastHits: number; furthestBeast: string | null }
/** In-voice one-liner bank (>= 8 authored lines, Silverstein register, e.g.
 *  "You outran it for a while. That counts. It always counted.") picked via
 *  rng fork `card:${Math.round(kmSurvived*10)}` — deterministic per distance. */
export function cardLine(rng: Rng, kmSurvived: number): string;
/** Pure standalone SVG (no foreignObject): 480x300, paper bg, wobble-filter def
 *  INLINE (copy the filter markup, id "wobble-card" to avoid collisions),
 *  hand-drawn border path, title "OUTRUN THE QUIET", the stat line
 *  `you outran The Quiet for ${kmSurvived.toFixed(1)} km` and
 *  `real-you ran ${realKm.toFixed(1)} km that year`, the cardLine poem line,
 *  small doodle strokes. All text esc()'d. Colors as LITERALS (light theme
 *  values) so the PNG is theme-independent: bg #FAF6EC ink #26211A pencil #4E525C. */
export function scoreCardSvg(facts: ScoreFacts, line: string): string;
```

- [ ] Failing tests: spawn determinism (same rng seed → identical layout; different seed differs); first obstacle at 160; gaps within [90,220]; ends before terrainLength-100; zero-beast fallback named correctly; sizes per kind exact; hitTest — grounded runner overlapping → hit; yM above heightM → null; non-overlap → null; alive() drops swallowed. cardLine deterministic per rounded distance, non-empty for 20 distances, register check is human (reviewer). scoreCardSvg contains both stat strings with exact toFixed(1) values, esc()'d test with a name containing "&", id "wobble-card" exactly once, no "{" leftovers, starts with `<svg`.
- [ ] Implement → gates green → commit `feat: obstacles from your beasts + score card`.

---

### Task E3: Canvas + loop + integration (`draw.ts`, `game.ts`, `index.ts`, app wiring)

**Files:**
- Create: `src/game/draw.ts`, `src/game/game.ts`, `src/game/index.ts`
- Modify: `src/render/pages.ts` (back-matter game page: `<section class="page page-game" data-page="game">` between beasts index and colophon, with kicker "in which you are given one more chance", title "Outrun the Quiet", an in-voice how-to line ("press space, or tap — the fog is patient but you are faster"), and `<div class="game-mount"></div>`; adjust pages.test section count), `src/app/main.ts` (after initLivingBook: `initGame(mountEl, year, book)` guarded try/catch like living; `#game` hash on the COVER screen → jump straight to demo book scrolled to the game page), `src/app/shell.css` + `src/render/theme.css` (game canvas frame, HUD text, buttons).

**Exact behaviors:**
- Canvas 800×360 CSS-scaled to container width (dpr-aware), class `game-canvas no-print`.
- Idle state: attract frame — terrain preview + runner standing + "press space / tap to run" in handwriting face (static under reduced motion; gentle runner bob otherwise). Start on first jump input.
- Loop: rAF; accumulator drives `step()` at fixed TICK_MS (cap 5 steps/frame — spiral-of-death guard); input edge-detect from keydown(space)/pointerdown on canvas; `document.hidden` pauses (fog does not eat you in another tab).
- Camera: runner fixed at 30% width; world scrolls; px-per-meter = 6. Ground line from `elevAt` scaled: elevation range mapped into lower 40% of canvas (min 3 px/m vertical exaggeration cap — compute scale = min(3, 120/(elevMax-elevMin || 1))).
- Rendering (draw.ts): all strokes ink-colored, 2-3 px, slight per-segment jitter seeded per WORLD segment index (stable frame-to-frame — no boiling; use hashString(segmentIndex) → tiny offset). Terrain = single polyline; obstacles = simplified doodle glyphs per kind (5-8 strokes each, drawn by you, matching doodles.ts vibe); runner = the stick figure (reuse the D1 runner shapes, legs alternate by xM phase); The Quiet = paper-colored gradient wall from left edge to quietXM×scale with a wobbled leading edge + faint eraser-crumb specks (Math.random OK, flourish only, disabled under reduced motion).
- Collision glue: on hitTest hit → set stumbleUntilTick = tick + 90 (0.75 s), remove that obstacle, increment beastHits, HUD flash the beast's name in-voice ("The 00:45 got you by the ankle").
- HUD: top-right handwriting: `${kmSurvived} km` live; on death: overlay the score card (render scoreCardSvg into an <img> via data URI), buttons "run it back" (fresh initialState, same seed layout) and "keep the card" (PNG download via the share.ts canvas pipeline pattern — svg data URI → Image → canvas 2x → toBlob → download `inkline-scorecard.png`).
- kmSurvived = xM/1000 × (real total km / game-terrain km)? NO — honesty: kmSurvived = xM/1000 of REAL terrain meters (terrain IS real meters); realKm = colophon.totalKm. Straight comparison.
- `initGame(container, year, book): { teardown(): void }` — teardown cancels rAF, removes listeners, clears canvas. Wired into main.ts start-over teardown chain.
- Determinism note: spawn layout seeded from `seedFromYear(year)`; physics deterministic; only visual flourish is random.

- [ ] Tests (pure-testable slices): px-per-meter/vertical-scale math extracted as `export function verticalScale(elevMin, elevMax): number` in draw.ts with tests (cap at 3, degenerate range → 3); pages.test updated section count + game page present with mount div + kicker text; everything else = controller browser acceptance.
- [ ] Implement → gates green → commit `feat: Outrun the Quiet - the back of the book plays`.

---

## Acceptance (controller)

Headless Chrome: demo book → game page present; press space → runner advances (HUD km grows); jump clears an obstacle (scripted: wait for obstacle approach, jump, verify no stumble flash — approximate via HUD/beastHits exposure `data-beast-hits` attr on mount); let the fog win → score card overlay appears with both stat lines and a poem line; "keep the card" downloads a PNG (magic bytes, >10KB); "run it back" restarts (HUD resets); reduced-motion: game still playable, no attract bob; real-zip spot check (terrain from 80 real runs loads, no errors); zero external requests; zero JS errors. Screenshots reviewed.
