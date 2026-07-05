# Plan C — Render & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `Book` into a scrollable, printable, ink-on-paper web book; wrap the whole pipeline in a zero-install browser app (drop zone → progress → book) deployed to GitHub Pages.

**Architecture:** `src/render` is pure string-producing functions (`Book` + `Year` → HTML/SVG strings) — fully unit-testable without a DOM. `src/app` is a thin DOM shell (drop zone, progress, error pages in verse) that wires File → ingest → analyze → storytell → render. Vite builds the static site; a GitHub Actions workflow deploys `dist/` to Pages.

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess`, Vite (new devDependency), Vitest. Runtime deps remain ONLY `fflate` + `tz-lookup`.

## Global Constraints

- Runtime deps unchanged: `fflate`, `tz-lookup` ONLY. Vite is a devDependency (build tool, not shipped).
- Deterministic render: same `Book`+`Year` → identical HTML string. Jitter/wobble randomness comes ONLY from `Rng` seeded by stable ids (`hashString(runId)` etc.). No `Date.now()`, no `Math.random()`, no locale-dependent formatting anywhere in `src/render`.
- All user-facing copy is in-voice (Silverstein register: wry, concrete, kid-serious). NEVER a raw error string, stack trace, or "Error:" prefix on screen.
- Privacy is a feature: the app makes zero network requests after page load (no fonts from CDNs, no analytics, no telemetry). System font stacks only.
- Escape ALL data-derived strings into HTML via an `esc()` helper (defense in depth even though upstream is authored copy).
- **Aesthetic tokens (from the approved prototype — use these EXACT values):**
  - Light (default "ink on paper"): `--desk: #E9E2D2; --paper: #FAF6EC; --ink: #26211A; --ink-faint: #6F6759; --pencil: #4E525C; --shadow: rgba(60,50,30,.18);`
  - Dark ("night edition", chalk on slate): `--desk: #12141A; --paper: #1C1F26; --ink: #E9E5DB; --ink-faint: #9A9EA8; --pencil: #BDB3A0; --shadow: rgba(0,0,0,.5);`
  - Serif (verse/body): `font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;`
  - Handwriting (map labels, annotations): `font-family: "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive;`
  - Wobble filter (defined ONCE in an inline SVG `<defs>`): `<feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/>` with filter id `wobble`.
- Theming: CSS custom properties on `:root`; dark via BOTH `@media (prefers-color-scheme: dark)` (token redefinition) AND explicit `:root[data-theme="dark"]` / `:root[data-theme="light"]` overrides (toggle wins in both directions). Components style through tokens only.
- Print: `@media print` — one `.page` per sheet (`page-break-after: always`), animations/atmosphere none, force light-theme token values regardless of `data-theme`, hide app chrome (toolbar, buttons).
- Tests colocated. Commit style `feat:`/`fix:`/`test:`/`docs:` + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Consume upstream ONLY via public surfaces: `src/ingest/index.ts` (`readExportZip`, `buildYear`, types, `haversineM`), `src/analyze/index.ts` (`analyzeYear`), `src/storytell/index.ts` (`buildBook`, `Book` types, `Rng`, `hashString`), `src/fixtures/synthetic.ts` (`makeSyntheticYear`).
- `Chapter.mapSpec` route lookups: `{kind:"route", runId}` → find run in `year.runs`; run absent or trackless → render the chapter's first doodle instead (never throw).

## File Structure

```
src/render/
  svg.ts        projection, deterministic jitter+smoothing, routeSvg, flightSvg
  doodles.ts    hand-authored SVG doodle library keyed by doodleTag
  pages.ts      renderBook(book, year): string — the whole book as HTML
  theme.css     tokens, typography, page layout, wobble aesthetics, print CSS
  index.ts      export { renderBook } + esc + svg helpers used by app
src/app/
  main.ts       DOM shell: cover → ingest → progress → book; toolbar
  files.ts      pure file-routing helpers (testable without DOM)
  errors.ts     in-voice error/edge pages (authored verse, pure functions)
  shell.css     cover, drop zone, progress, toolbar styles
index.html      Vite entry (repo root)
vite.config.ts
.github/workflows/deploy.yml
README.md       rewritten as the project's front page
```

---

### Task C1: Route & flight SVG (`src/render/svg.ts`)

**Files:**
- Create: `src/render/svg.ts`, `src/render/svg.test.ts`

**Interfaces (Produces):**

```ts
import type { TrackPoint } from "../ingest";
import type { LatLonName } from "../storytell";

export interface XY { x: number; y: number }
/** Equirectangular local projection: lon scaled by cos(midLat), fit into
 *  (width×height) minus pad on all sides, aspect preserved, centered.
 *  Y inverted (north = up). <2 points → []. */
export function projectTrack(track: readonly TrackPoint[], width?: number, height?: number, pad?: number): XY[];
// defaults: width 400, height 300, pad 24

/** Deterministic hand-drawn path: jitter each point by Rng(hashString(seed))
 *  (dx, dy each in [-amp, +amp], amp default 1.6), then midpoint quadratic
 *  smoothing: M p0, then Q through each pair (control = original point,
 *  endpoint = midpoint of consecutive), ending L to last point.
 *  Coordinates rounded to 1 decimal in the d string. */
export function pathFrom(points: readonly XY[], seed: string, amp?: number): string;

/** Complete inline <svg> for a run's route: viewBox "0 0 400 300",
 *  class "ink-map", single <path> with class "ink-route",
 *  filter="url(#wobble)", fill="none" (stroke via CSS).
 *  Track is downsampled first (ingest downsample, tolerance 8) if > 220 points,
 *  doubling tolerance until <= 220. Start marker: small circle at first point
 *  (class "ink-start"). Returns "" for < 2 usable points. */
export function routeSvg(track: readonly TrackPoint[], runId: string): string;

/** Hand-drawn flight page graphic: viewBox "0 0 400 300"; a globe (circle
 *  r≈110 centered 200,150 class "ink-globe") with 3 elliptical graticule
 *  arcs (class "ink-graticule"), from/to dots placed deterministically:
 *  angle around the globe rim derived from hashString(name) % 360 for each
 *  endpoint (re-derive if within 40° of each other: add 137° until apart),
 *  a dashed quadratic arc between them bowing outward (class "ink-arc"),
 *  handwriting labels (class "ink-label") with esc()'d names, and the
 *  distance "≈ N,NNN km" (integer, comma-grouped manually — no locale)
 *  as a label near the arc midpoint. */
export function flightSvg(from: LatLonName, to: LatLonName, km: number): string;

/** HTML-escape &, <, >, ", ' */
export function esc(s: string): string;
```

- [ ] **Step 1:** Failing tests: projectTrack on a 3-point Mumbai triangle stays within pad bounds ([24, 376]×[24, 276]), preserves aspect (dx/dy ratio ≈ ground-truth within 10%), north = smaller y; single point → []; pathFrom deterministic (same seed twice → identical string), different seeds differ, starts with "M", contains "Q", coordinates 1-decimal; amp respected (max |jittered − original| ≤ amp across many points, checked by parsing the first M point vs input); routeSvg contains viewBox, class ink-route, filter url(#wobble), circle ink-start; routeSvg with 1 point → ""; routeSvg with 500-point track emits ≤ 220 route points (count "Q" occurrences ≤ 221); flightSvg contains both esc()'d names (test with a name containing "&"), dashed arc class, comma-grouped distance ("12,842" style — test with km=12841.7 → "≈ 12,842 km"); flightSvg deterministic; esc covers all 5 chars.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (import `downsample` from `../ingest/downsample`; if not exported via index, add `export { downsample } from "./downsample";` to `src/ingest/index.ts`). **Step 4:** Full suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: route and flight SVG - projection, deterministic ink jitter`

---

### Task C2: Doodle library + theme (`src/render/doodles.ts`, `src/render/theme.css`)

**Files:**
- Create: `src/render/doodles.ts`, `src/render/doodles.test.ts`, `src/render/theme.css`

**Interfaces (Produces):**

```ts
// doodles.ts
/** Every tag book.ts can emit. Keep in sync with DOODLE map in book.ts. */
export const DOODLE_TAGS = ["shoes", "empty-shoes", "moon", "stars", "plane", "globe", "hills", "calendar", "banana", "ghost", "trophy", "chain", "wind"] as const;
export type DoodleTag = (typeof DOODLE_TAGS)[number];
/** Inline <svg> (viewBox "0 0 120 120", class "ink-doodle", stroke-only
 *  paths, filter="url(#wobble)") or "" for unknown tags. */
export function doodleFor(tag: string): string;
```

**Doodle authoring rules:** each doodle is 2–6 hand-authored `<path>`/`<circle>`/`<line>` elements, stroke-only (`fill="none"`, stroke via CSS class), deliberately imperfect (slightly asymmetric curves — you are drawing with a pen, not a compiler). Concrete depictions: shoes = side-view sneaker with loose lace; empty-shoes = pair of shoes, laces limp, tiny motion-less lines; moon = crescent + 2 small stars; stars = 3 four-point sparks of differing size; plane = paper plane with dotted trail loop; globe = circle + 2 graticules + tiny flag; hills = two overlapping humps, one with a hairline switchback; calendar = page with 2 rings and X'd boxes; banana = peel with flopped-open skin; ghost = wavy-hem sheet with two eyes, slightly transparent (opacity .8); trophy = lopsided cup with one bent handle; chain = 3 interlocked oval links; wind = 3 speed-curls. NO text elements inside doodles.

**theme.css contents (all of it — app pages import this one file):**
1. Token blocks exactly per Global Constraints (`:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`, `:root[data-theme="light"]`).
2. Base: `body { background: var(--desk); color: var(--ink); margin: 0; }` serif stack on body; `.hand` class for handwriting stack.
3. `.page`: paper card — `background: var(--paper); max-width: 720px; margin: 3rem auto; padding: 4rem 3.5rem; box-shadow: 0 6px 30px var(--shadow); border-radius: 2px; position: relative;`
4. Typography: `.kicker` (small caps via font-variant, letter-spacing .08em, color var(--ink-faint)); `.chapter-title` (2.2rem, per-letter tilt handled by pages.ts spans: `.tilt-a { display:inline-block; transform: rotate(-1.2deg);} .tilt-b { … rotate(0.8deg);} .tilt-c { … rotate(-0.4deg);}`); `.verse` (1.15rem, line-height 1.9, white-space pre-line is NOT used — verse lines are <div>s); `.stats` (handwriting stack, color var(--pencil)).
5. Ink strokes: `.ink-route, .ink-globe, .ink-graticule, .ink-arc, .ink-doodle path, .ink-doodle circle, .ink-doodle line { stroke: var(--ink); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; fill: none; }` `.ink-arc { stroke-dasharray: 6 7; }` `.ink-graticule { stroke: var(--ink-faint); stroke-width: 1.2; }` `.ink-start { fill: var(--ink); }` `.ink-label { font-family: <handwriting stack>; font-size: 13px; fill: var(--pencil); }`
6. Print block per Global Constraints, PLUS `.page { box-shadow: none; margin: 0; max-width: none; }` and `@page { margin: 12mm; }`.

- [ ] **Step 1:** Failing tests: `doodleFor` returns non-empty for EVERY tag in DOODLE_TAGS; every result contains `class="ink-doodle"`, `viewBox="0 0 120 120"`, `filter="url(#wobble)"`, and NO `<text`; unknown tag → ""; every doodle's element count 2–8; cross-check vs book: build fixture book (`makeSyntheticYear` → `analyzeYear` → `buildBook`) and assert every `doodleTags` entry AND every beast `doodleTag` gets a non-empty doodle.
- [ ] **Step 2:** FAIL. **Step 3:** Author doodles + theme.css (css has no test; visual check in C4 acceptance). **Step 4:** Full suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: doodle library and ink-on-paper theme`

---

### Task C3: Book renderer (`src/render/pages.ts`, `src/render/index.ts`)

**Files:**
- Create: `src/render/pages.ts`, `src/render/pages.test.ts`, `src/render/index.ts`

**Interfaces (Consumes:** C1 + C2, Book/Year. **Produces):**

```ts
// pages.ts
/** The entire book as an HTML string of consecutive <section class="page" …>
 *  elements, PRECEDED by the wobble-filter defs svg (rendered exactly once,
 *  style="position:absolute;width:0;height:0"). Structure:
 *  1. Cover page: <section class="page page-cover" data-page="cover">
 *     book title as .book-title with per-letter tilt spans, .book-subtitle,
 *     a large centered doodle (first chapter's first doodleTag, else "shoes").
 *  2. Dedication page: each dedication line a .dedication div; class page-dedication.
 *  3. One page per chapter: <section class="page page-chapter" data-page="ch-{i}"
 *     data-event="{eventType}" data-atmosphere="{atmosphereTags joined by space}">
 *     .kicker, <h2 class="chapter-title"> (per-letter tilt), .verse (one div per line),
 *     map area: routeSvg for {kind:"route"} (run found in year.runs by runId AND has
 *     track), flightSvg for {kind:"flight"}, else first doodle; .stats as
 *     <dl> label/value pairs; doodle strip (remaining doodleTags, small).
 *  4. Beasts index page (if any): .beast-entry per beast: doodle + .beast-name +
 *     .beast-desc. Kicker: "a field guide to what chased you".
 *  5. Colophon page: run counts, totalKm, places, the privacy note, and the line
 *     "drawn deterministically — the same year makes the same book, forever."
 *  ALL data-derived text through esc(). Per-letter tilt: wrap each non-space
 *  char in <span class="tilt-a|tilt-b|tilt-c"> cycling a,b,c. */
export function renderBook(book: Book, year: Year): string;

// index.ts
export { renderBook } from "./pages";
export { esc } from "./svg";
export { doodleFor } from "./doodles";
```

Empty book (0 chapters): render cover + dedication + colophon, plus one authored "empty year" page: kicker "in which the shoes wait", title "A Blank Page, For Now", two authored in-voice lines (write them in pages.ts as consts — e.g. "No runs to read. The book is thin." / "But every book starts thinner than it ends.").

- [ ] **Step 1:** Failing tests (fixture book via `makeSyntheticYear()` → `analyzeYear` → `buildBook`): output contains exactly one `id="wobble"`; `<section` count === chapters + 3 (cover, dedication, colophon) + (beasts page if beasts.length > 0 → assert with fixture's actual beast count); every chapter title appears esc()'d (fixture titles are plain — additionally unit-test tilt-spanning via a direct call on a title containing "&" through the exported renderBook on a hand-built minimal Book with title `Ampersand & Son` — assert `&amp;` inside spans and no raw `&`); every verse line present; route chapters contain `class="ink-map"`, journey chapter contains `ink-arc`; every `data-atmosphere` attribute matches the chapter's atmosphereTags; stats labels+values present; colophon contains totalKm with " km", the privacy note verbatim, and the determinism line; deterministic: two renders identical; empty Book (buildBook on empty Year) → contains "A Blank Page, For Now", no `.page-chapter`; renderBook never throws when a route mapSpec's runId is missing from year.runs (hand-build that case; expect doodle fallback).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** Full suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: book renderer - Book to ink-on-paper pages`

---

### Task C4: App shell (`index.html`, `src/app/*`, `vite.config.ts`)

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/app/main.ts`, `src/app/files.ts`, `src/app/files.test.ts`, `src/app/errors.ts`, `src/app/errors.test.ts`, `src/app/shell.css`
- Modify: `package.json` (add devDep `vite@^6`, scripts `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`)

**Interfaces (Produces):**

```ts
// files.ts — pure, no DOM
export type FileRoute = { kind: "zip"; file: File } | { kind: "gpx"; files: File[] } | { kind: "none" };
/** .zip (name or type) → zip (first zip wins); else all *.gpx files → gpx; else none. Case-insensitive. */
export function routeFiles(files: readonly File[]): FileRoute;
/** Loose GPX files → RawExport shape: { gpxFiles: Map(name→text), exportXml: null } */
export async function gpxToRaw(files: readonly File[]): Promise<{ gpxFiles: Map<string, string>; exportXml: string | null }>;

// errors.ts — pure, authored copy, each returns full page-section HTML (uses esc)
export function rejectionPage(): string;   // not-a-health-export: quatrain + numbered how-to-export-from-Health-app steps (Health app → profile → Export All Health Data)
export function brokenZipPage(): string;   // unreadable zip: in-voice couplet + "try re-exporting" line
```

**main.ts behavior (DOM glue — no unit tests; verified by build + acceptance):**
1. On load: render cover screen into `#app`: closed-book cover (CSS 3D-less for now — Plan D animates it), headline "Inkline", tagline "drop your Apple Health export — get the storybook of your running year", drop zone (drag-over class toggle), hidden `<input type="file" multiple>` triggered by a "choose a file" button, "or read the demo book" link, and the privacy line "everything happens in this tab; your data never leaves it".
2. Drop/choose → `routeFiles`: zip → `file.arrayBuffer()` → `new Uint8Array` → `readExportZip` → `buildYear`; gpx → `gpxToRaw` → `buildYear`; none → `rejectionPage()`.
3. Progress screen between stages, in-voice, real numbers: "unlacing the zip…" → after unzip "found N routes and an index of everything" (gpxFiles.size; if exportXml absent say "found N routes, no index — routes will do") → "reading your year…" → after buildYear "M runs, K with maps" → "noticing things…" (analyzeYear) → "writing the book…" (buildBook) → "inking the pages…" (renderBook). Yield to paint between stages (`await new Promise(r => setTimeout(r, 30))`).
4. Errors: wrap each stage; zip stage failure → brokenZipPage(); zero-file → rejectionPage(); any downstream throw → rejectionPage() variant with the caught stage name in-voice ("the book got stuck at the {stage} — try again, or export fresh"). NEVER print the raw error. Log the real error via console.error for debuggability.
5. Book screen: `renderBook` output into `#app` inside `<main class="book">`, plus fixed toolbar (class `toolbar no-print`): theme toggle (cycles auto → light → dark; sets/removes `data-theme` on `<html>`; persists `localStorage.inkline-theme`; applied on load too), print button (`window.print()`), "start over" button (back to cover, full state reset). Keyboard ←/→: scroll to previous/next `.page` (`scrollIntoView({behavior:"smooth"})`, tracked index, no wrap).
6. Demo link → `makeSyntheticYear()` → same pipeline sans ingest.
7. `index.html`: `<html lang="en">`, meta viewport, `<title>Inkline — the storybook of your running year</title>`, meta description, `#app`, module script `/src/app/main.ts`, imports of both css files from the ts entry (Vite handles).

**vite.config.ts:** `base: process.env.GITHUB_ACTIONS ? "/inkline/" : "/"`, `build: { target: "es2020" }`.

- [ ] **Step 1:** Failing tests for files.ts (File is constructible in Node 20+/vitest: `new File(["x"], "a.zip", { type: "application/zip" })`): zip beats gpx when both present; case-insensitive ".ZIP"/".GPX"; gpx-only → all gpx files, non-gpx dross ignored; empty/none → none; gpxToRaw map keys = file names, values = text, exportXml null. errors.ts: pages contain no "Error", contain `class="page"`, rejection page contains "Export All Health Data".
- [ ] **Step 2:** FAIL. **Step 3:** Implement all files; `npm i -D vite@^6`. **Step 4:** Full suite + typecheck PASS **and** `npm run build` succeeds (dist/ produced; verify `dist/index.html` exists). Add `dist` to `.gitignore`.
- [ ] **Step 5:** Commit: `feat: app shell - cover, drop zone, progress, book view`

---

### Task C5: Pages deploy + README (`.github/workflows/deploy.yml`, `README.md`)

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md` (full rewrite), `package.json` only if a script is missing

**deploy.yml (exact):**

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**README.md contents (write it as the project's storefront, in the project's voice but informative):** hero paragraph (what it is, one breath); "Try it" → https://rohnach29.github.io/inkline/ + demo-book note; What it makes (chapters, beasts, verse — 3 example verse lines quoted from the committed fixture snapshot); Privacy (client-side only, zero network after load, verifiable); How to export from Apple Health (3 steps); Also accepts loose GPX; How it works (pipeline diagram in ascii: ingest → analyze → storytell → render, one line each); Determinism note (same export → same book); Development (npm i / test / dev / build); Tech notes (no framework, 2 runtime deps, timezone-from-GPS law — one line each); Roadmap teaser (living pages, a game in the back of the book — "coming in the next chapters"). No badges, no lorem, no screenshots yet (Plan D adds a GIF).

- [ ] **Step 1:** Write workflow + README. **Step 2:** Validate: `npx vitest run` still green (no code change), `npm run build` green, README proof-read pass (read it fresh top to bottom). **Step 3:** Commit: `docs: deploy workflow and project README`

**Controller (not implementer) afterwards:** enable Pages via `gh api repos/rohnach29/inkline/pages -X POST -f build_type=workflow` (ignore 409 if already enabled), merge, watch the workflow run, verify the live URL serves the cover and the demo book renders.

---

## Acceptance (controller, after merge)

1. `npm run build`; serve `dist/` locally; open in Chrome (claude-in-chrome): cover renders, demo book opens, chapters show routes/flights/doodles, theme toggle works both ways, print preview paginates one page per sheet.
2. Real-export test: zip the real export locally (scratchpad), load via the file input in Chrome, verify the real book renders end-to-end in-browser (87 runs, 14 chapters incl. 33.4 km + Everlasting Quiet), and that no network requests fire after load (Network tab via read_network_requests).
3. Live Pages URL check after deploy workflow goes green.
