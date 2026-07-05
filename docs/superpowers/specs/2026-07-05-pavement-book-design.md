# Where the Pavement Ends — Design Spec

**Date:** 2026-07-05
**Status:** Approved pending user review
**One-liner:** A zero-install browser app that turns an Apple Health export (or plain GPX files) into an illustrated, animated, printable Shel-Silverstein-style storybook — entirely client-side; health data never leaves the browser.

## Goals

1. A portfolio-grade, viral-friendly GitHub project with an unbeatable demo: drop your Apple Health `export.zip` on a book cover, watch your running year become an illustrated poetry book.
2. Fully deterministic core: same export in → same book out. No servers, no accounts, no API keys.
3. Printable: the same HTML paginates to a clean PDF via the browser's print dialog.
4. Delightful: the book is *alive* on screen (self-drawing ink, ambient atmosphere, a playable mini-game) while remaining a quiet ink-on-paper object in spirit and in print.

## Non-goals (v1)

- No backend, no user accounts, no data upload of any kind.
- No LLM dependency in the core path. (Architecture leaves room for an optional verse-enhancement hook later; not in v1.)
- No native/mobile app. No Strava OAuth (plain GPX drop covers Strava exports).
- No map tiles or third-party map services — routes render as standalone ink drawings.

## Architecture

A static site (Vite + TypeScript, vanilla DOM/SVG/Canvas — no UI framework) deployed on GitHub Pages. One repo, four core packages matching the pipeline, plus the app shell and game:

```
ingest → analyze → storytell → render
                                  ↳ living-book (animation/atmosphere layer)
app shell (cover/drop-zone/progress)      game ("Outrun the Quiet")
```

Every stage's output is a plain serializable object, inspectable and golden-testable.

### 1. `ingest` — from files to a Year model

- Accepts: a dropped Apple Health `export.zip`, or loose `.gpx` files, or a "show me the demo" click (bundled synthetic sample data).
- Unzips in-browser with `fflate` (streaming; exports can be hundreds of MB).
- Parses `workout-routes/*.gpx` → tracks of `(lat, lon, ele, utcTime)`.
- Parses `export.xml` (streaming SAX-style, never full-DOM) → workout records: distance, duration, heart-rate stats, energy, indoor flag.
- Matches routes to workout records by timestamp overlap.
- **Timezone law:** a run's local time is derived from its own first GPS coordinate via `tz-lookup` (offline IANA lookup). Device clocks, filenames, and export timezone are never trusted. Runs without GPS use the export's declared timezone and are flagged `timezoneUncertain`.
- Downsamples tracks (Douglas-Peucker) to render-friendly point counts while keeping full stats from the raw track.
- Output: `Year` — `{ runs: Run[], places: Place[], span }` where `Run = { id, startLocal, tz, track?, km, minutes, elevationGain, hr?, indoor, place }`.

### 2. `analyze` — from data to noticing things

Pure functions over `Year`. Each detector emits tagged `StoryEvent`s with evidence:

- **Route clustering:** geometric overlap (grid-hash of track points) groups runs into recurring routes. Most-repeated route becomes a character.
- **Hill detection:** sustained-climb scan over elevation profiles; steepest recurring climb becomes a named beast. Suspicious spikes (GPS ghosts) flagged, kept as lore ("possibly a ghost").
- **Relocation detection:** consecutive runs > 500 km apart → `journey` event with distance and place names (reverse-geocoded offline from a small bundled city centroid list — no API).
- **Pattern mining:** streaks, gaps (> 21 days → a "Quiet"), personal records (longest, fastest, earliest, latest, hilliest), first run, latest run, true-night runs (local start 22:00–04:00), monthly aggregates.
- **False starts:** runs < 1 km ended within minutes of a longer same-day run, or standalone sub-1 km runs.
- Output: `Story = { events: StoryEvent[], entities: Entity[] }` — the plot outline.

### 3. `storytell` — the deterministic author

- Seeded PRNG; seed = hash of the Year model. Same export → identical book, forever.
- **Naming:** word-bank grammars name entities (hills, routes, quiets, beasts). Grammar output is seeded, so names are stable per export.
- **Selection over generation:** the author's main job is choosing which events earn pages (scoring by rarity/magnitude), ordering chapters, and tracking continuity so early characters get callbacks.
- **Verse:** poems assembled from a hand-written library of template lines (target ≥ 120 fragments across moods: triumphant, sheepish, nocturnal, quiet, absurd) with slot-filling constrained by a rhyming dictionary (CMU-derived word list, bundled) and syllable counts, so lines rhyme and scan. The craft lives in the fragment writing; the algorithm selects and fills.
- **Honesty rule:** every number printed in the book must come from the data. No invented stats.
- Output: `Book` — cover, dedication, chapters (each: kicker, title, verse, mapSpec, doodleTags, atmosphereTags), flight pages, beasts index, colophon.

### 4. `render` — from Book to pages

- Each spread → an HTML section styled as a paper page (the prototype's ink-on-paper aesthetic: warm ivory paper / near-black ink; dark theme = "night edition" chalk-on-slate; token-based theming with `data-theme` override).
- Routes render as SVG paths: projected, jittered, quadratic-smoothed, wobble-filtered (`feTurbulence` + `feDisplacementMap`) — pen-and-ink, never GPS-clinical.
- Doodle library keyed by `doodleTags`: moon, sun, stars, rain, empty shoes, plane/globe, hills, dog, etc. Hand-authored SVG primitives with the same wobble treatment.
- Typography: storybook serif for verse (Iowan Old Style/Palatino stack), handwriting stack for map annotations, per-letter tilt on display titles.
- **Print:** `@media print` gives one page per sheet, disables all animation/atmosphere, forces light theme. Print output is a first-class deliverable, tested each release.
- **Share-a-page:** any spread exports as PNG (SVG → canvas rasterization, client-side).

### 5. `living-book` — the delight layer (screen only)

All effects honor `prefers-reduced-motion` (reduced = static book, fully functional) and are absent in print.

- **Self-drawing ink:** on page entry (IntersectionObserver), route strokes draw in via `stroke-dashoffset`, led by a tiny stick-figure runner following the path (`getPointAtLength`). Draw duration maps to that run's real average pace, normalized to a 2–6 s range — the year visibly speeds up.
- **Atmosphere:** one shared canvas layer per visible page, particle systems keyed by `atmosphereTags` from real data: monsoon drizzle (Mumbai Jun–Sep pages), fireflies (true night runs), falling leaves (autumn), snow (winter runs if present). Ink-fleck monochrome, sparse, subtle. Budget: < 4 ms/frame midrange laptop; degrade to none on low-power.
- **Living beasts:** index doodles respond to hover/tap with 1–2 s hand-drawn micro-animations (SMIL/CSS on stroked paths). One per beast type.
- **Flight page:** for each `journey` event — hand-drawn globe, great-circle dotted arc draws itself, distance annotated in the handwriting face.
- **Cover interaction:** landing page is the closed book; drag-over lifts the cover slightly; drop swings it open (3D CSS transform) into the progress sequence ("reading your 80 runs…", live counts from the actual parse).
- **Pencil sounds (off by default):** WebAudio-synthesized pencil scratch during ink draws, paper whoosh on page transitions. No audio assets. Toggle persisted in localStorage.

### 6. `game` — "Outrun the Quiet" (back of the book)

A one-button canvas doodle-runner, playable page in the back matter; also reachable directly (`#game`) for shareability.

- **Terrain = your real elevation profiles**, stitched run-by-run in chronological order and scaled — you literally run your year's hills.
- A stick-figure runner auto-runs; tap/space to jump. Obstacles are beasts from *your* index (The 2:54 as a snoozing lump, False Starts as banana-peel squiggles, Mount Regret as itself).
- **The Quiet** chases from the left: a white fog that visibly un-draws the world (erases the ink) as it advances. Pausing too long loses ground.
- Score = kilometers survived, benchmarked against the real year ("you outran The Quiet for 12 km. Real-you ran 569.").
- Death is charming, in-voice: hand-drawn score card with a one-line poem, exportable as PNG.
- Aesthetic: identical ink-on-paper language — the game must look like a page that came alive, not a bolted-on arcade. Demo-data players get the synthetic year's terrain, so the game works for visitors with no export.

### App shell & flow

1. **Cover (landing):** closed book + drop zone + "read the demo book" link. Static-rendered demo book (from bundled synthetic data) means zero-effort first impression.
2. **Progress:** in-voice progress page driven by real pipeline events.
3. **Book:** scrollable spreads, keyboard page-turn (←/→), table of contents ribbon, theme toggle, sound toggle, print button, share-page buttons, game in back matter.
4. Everything runs client-side; a strict CSP and a "your data never leaves this page" note in the colophon (verifiably true — no network calls after load).

## Error handling (in-voice, never a stack trace)

- No `workout-routes/` in zip → book of "Nowhere Miles" from `export.xml` metadata alone (indoor-run chapters, no maps, shoes-doodle pages).
- Corrupt/unparseable individual files → skipped; counted in colophon ("three runs could not be read; we assume they were embarrassing").
- Zip too large / memory pressure → streaming parse, aggressive downsampling; if still failing, offer "routes only" mode (skip export.xml).
- Not an Apple Health zip / random files → gentle rejection page in verse, with instructions for exporting from the Health app.
- < 3 runs → "A Very Short Book" — still generates, owns the brevity.

## Testing

- **Golden-file tests:** fixture exports (synthetic, committed) → exact `Year`/`Story`/`Book` JSON snapshots. Determinism makes this airtight; any diff is a real behavior change.
- **Unit tests** per analyzer/detector and per verse constraint (rhyme, syllable count, slot filling).
- **Property tests:** ingest never throws on malformed GPX/XML corpus; timezone derivation matches known city fixtures.
- **Render smoke tests:** book HTML builds for all fixtures; print CSS produces expected page count (via headless Chrome).
- **Game:** deterministic physics tick under a seeded clock; terrain-stitching unit tests.
- **Acceptance:** the author's real export (kept out of repo) run locally before each release.

## Stack & dependencies

TypeScript, Vite, Vitest. Runtime deps (kept deliberately tiny): `fflate` (zip), `tz-lookup` (offline timezone), bundled CMU-derived rhyme word list, seeded PRNG (e.g. tiny xoshiro impl in-repo). No UI framework, no chart libs, no map libs.

## Delivery phases

1. **Core pipeline (must):** ingest → analyze → storytell → render; static book; print CSS; demo data; deploy to Pages.
2. **Living book (should):** self-drawing ink, cover interaction, atmosphere, flight page, living beasts, share-PNG.
3. **Game (should, flagship demo):** Outrun the Quiet + score cards.
4. **Sound (could):** pencil/paper WebAudio toggle.

Phases 2–3 are the virality engine; phase 1 alone is already a complete, honest product.

## Risks

- **Verse quality is the product.** Template verse done lazily reads as Mad Libs. Mitigation: fragment library is authored writing, reviewed like copy, not filler; selection-over-generation design; golden tests keep regressions visible.
- **export.xml scale** (multi-year exports reach GB). Mitigation: streaming parse from day one; routes-only fallback.
- **Apple export format drift.** Mitigation: version-tolerant parsing, fixtures from multiple export versions as available.
- **Scope creep in the delight layer.** Mitigation: phases; the book must be excellent static-first.

## Decisions log

- Web-first scrollable book; print via print CSS (user decision).
- Browser app over CLI; privacy as a feature (user decision).
- No local/hosted LLMs in core (user constraint); deterministic authorship.
- Timezone from GPS coordinates, never device clock (discovered via user's real two-city data).
- Maximal creativity mandate: living-book layer + mini-game are in scope (user decision).
