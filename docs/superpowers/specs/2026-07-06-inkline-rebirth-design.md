# Inkline Rebirth — Design Spec

**Date:** 2026-07-06
**Status:** Approved direction (Approach 1: staged full rebirth). Plans F and G are in scope. **Plan H is DEFERRED (user decision 2026-07-06): TODO only — do not schedule or implement unless the user re-requests it.** The spec text for Plan H below is kept as the design of record for that future TODO.
**Supersedes:** the verse and doodle sections of `2026-07-05-pavement-book-design.md`; the game section of that spec is revoked.

## Why

The shipped book works but does not delight. User verdict on v1: every poem reads the same, the drawings are weak, the game feels bolted on. Root causes:

1. **Poems** — every chapter is assembled from the same mold: open couplet + data couplet + close couplet, all iambic pentameter, `{slot}`-filled. The assembly is the sameness; no couplet library fixes it.
2. **Drawings** — each doodle is 3–6 sparse hand-typed SVG paths depicting an *object*. Real Silverstein pages center a *person* mid-interaction with something absurd, drawn in dense, confident, imperfect pen line. Object icons have no one home.
3. **Game** — shares no visual or emotional language with the book; reads as an unrelated minigame.

## Decisions (locked with user)

- **LLM policy:** build-time authorship (Claude authors the corpus and art during development) + an optional runtime "deluxe" mode where a user-supplied API key writes poems live. The deterministic book is the default, the fallback, and must be excellent on its own.
- **Art:** procedural ink engine rendering hand-designed compositions — not AI-generated images, not denser icons.
- **Game:** cut entirely (code remains in git history).
- **Sequencing:** Plan F (poetry + game removal) → Plan G (character + ink engine) → Plan H (deluxe mode). Each plan ships a visibly better book on its own and merges independently.

## Constraints (unchanged from v1)

- Fully client-side; user health data never leaves the browser in core mode.
- Deterministic: same export → identical Book. No `Date.now`, `Math.random`, or locale dependence in core. All randomness through the existing seeded `Rng` (`src/storytell/rng.ts`) with order-independent `fork(label)` streams.
- Runtime deps stay fflate + tz-lookup only (Plan H adds zero deps — it uses `fetch`).
- TypeScript strict; Vitest; existing browser-acceptance harness (playwright-core + system Chrome headless in scratchpad).
- Ink-on-paper aesthetic tokens and dark "night edition" are unchanged.

---

## Plan F — Poetry Rebirth

### What is removed

- The couplet-assembly engine: `src/storytell/fragments.ts`, `src/storytell/rhyme.ts`, and the assembly logic in `src/storytell/verse.ts`, plus their tests (rhyme-family, scan, couplet-coverage gates). Quality moves from mechanical gates to authorship + a dedicated opus poetry-review pass; structural lint tests remain (see Tests).
- The game: `src/game/` entirely, the game section in `src/render/pages.ts`, the `#game` hash route and `initGame` wiring in `src/app/main.ts`, game CSS, game tests, and the game acceptance script. The book ends beasts → colophon. README updated to stop mentioning the game.

### The poem model

`Chapter.verse: string[]` is **replaced** by `Chapter.poem: ChapterPoem` in `src/storytell/types.ts`. The renderer (`src/render/pages.ts`) renders per form.

```ts
export type PoemForm =
  | "quatrain"    // 4-line rhymed stanza(s), 1–3 stanzas
  | "quip"        // 2–4 line jab, punchline-shaped
  | "list"        // anaphoric list poem ("The hill has eaten: …")
  | "dialogue"    // two voices, alternating, styled distinctly
  | "letter"      // "Dear Person Who Runs at Night," … signed
  | "notice"      // official sign/proclamation, centered, small-caps flavor
  | "spell"       // recipe/incantation with imperative lines
  | "concrete"    // typography draws the subject (indent/align/size per line)
  | "narrative";  // 12–20 line story poem with a turn

export interface ChapterPoem {
  form: PoemForm;
  lines: PoemLine[];
}

export interface PoemLine {
  text: string;
  voice?: 1 | 2;                     // dialogue only
  indent?: 0 | 1 | 2 | 3;            // list/concrete shaping
  align?: "left" | "center" | "right"; // notice/concrete; default left
  size?: "small" | "normal" | "large"; // concrete emphasis; default normal
}
```

### The corpus

- Location: `src/storytell/poems/` — one module per event type (16 files, e.g. `longest-run.ts`), plus `forms.ts` (the `PoemForm` registry + per-form rendering contract) and `index.ts` (aggregate + lookup).
- Each module exports `PoemSpec[]`:

```ts
export interface PoemSpec {
  id: string;                 // "<event-type>/<slug>", unique corpus-wide
  form: PoemForm;
  band: "small" | "medium" | "large" | "any"; // magnitude band it suits
  mood: Mood;                 // existing Mood union carries over
  slots: readonly SlotName[]; // every slot the lines reference, no more, no less
  lines: PoemLine[];          // text may contain {slot} tokens
}
```

  `SlotName` is a string-literal union defined in `poems/forms.ts`, covering the existing slot vocabulary (distance, count, day-count, name, month, time-of-day, place) — the same formatted values `verse.ts` fills today, carried over so `book.ts`'s value builders keep working.

- **Size:** minimum 8 poems per event type, ~150 total. Every poem is a complete, individually authored piece — an idea, images, and a turn — written by Claude (opus-tier authoring task) during implementation. No line may be shared between poems.
- **Slots are integral:** a slot appears only where the poem was written around it (a distance as the punchline, a name as a refrain, a month as the setting). Slot vocabulary reuses the existing formatted-value builders from `verse.ts`/`book.ts` (km, counts, day counts, names, month names, time-of-day phrases). The existing honesty rule holds: a poem may only state numbers the chapter's stats actually support.
- **Magnitude bands** decide register (teasing vs. epic). Band boundaries, applied to each event's primary magnitude:

| Event type | small | medium | large | magnitude |
|---|---|---|---|---|
| longest-run | < 8 km | 8–18 km | > 18 km | km |
| fastest-run | slower than 6:30/km | 6:30–5:00/km | faster than 5:00/km | pace |
| hilliest-run | < 60 m | 60–150 m | > 150 m | gain |
| streak | < 5 days | 5–10 days | > 10 days | days |
| quiet | < 21 days | 21–60 days | > 60 days | days |
| journey | < 2000 km | 2000–7000 km | > 7000 km | km |
| month | < 40 km | 40–90 km | > 90 km | month km |
| night-runs | < 3 runs | 3–6 runs | > 6 runs | count |
| false-starts | < 3 | 3–5 | > 5 | count |
| ghost-elevation | any band ("any" poems only) | | | — |
| route-champion | < 4 repeats | 4–8 repeats | > 8 repeats | count |
| hill-beast | same as hilliest-run | | | gain |
| first-run, last-run, earliest-run, latest-run | any band ("any" poems only) | | | — |

  A `band: "any"` poem is eligible for every band. Banded types must have ≥3 eligible poems per band (counting "any" poems); "any"-only types need ≥8 total.

- **Coverage floor:** every `(event type, band)` cell must offer poems in **≥3 distinct forms**, so the no-repeat selector never starves.

### Selection

- Per chapter, candidates = poems of that event type whose band matches (or `"any"`) and whose slots are all satisfiable from the chapter's data.
- **Form-diversity guarantee:** chapters are processed in book order. A poem whose form is already used in this book is excluded while unused-form candidates exist; if every candidate's form is used (only possible past 9 chapters), prefer the least-recently-used form. Result: **no form repeats within a book until all 9 forms have appeared.**
- Within the filtered candidates, choice is by the chapter's existing deterministic fork: `rng.fork(`poem:${type}:${atUtc}`)`.
- Dedication and colophon note keep their current generators (they were not the complaint).

### Rendering

- `pages.ts` gains per-form markup: dialogue voices styled as two hands (serif vs. handwriting font tokens), notice centered with letter-spaced small caps, letter with salutation/signature layout, concrete honoring indent/align/size, list with hanging indents. All via existing CSS token system; print stylesheet updated so every form survives print.
- Layout bound: no line over 60 characters after slot fill (lint-tested) so forms never overflow the page column on mobile.

### Tests (Plan F)

- Corpus lint: unique ids; declared slots exactly match tokens used; line-length bound; per-type minimums; band coverage floor; form-coverage floor; no duplicated lines corpus-wide.
- Selector: form-diversity property test over synthetic books (no repeated form while unused forms remain); determinism (same book twice → identical poems); band routing (a 5 km longest run never draws a `large` poem).
- Golden snapshot of the demo book regenerated once, then locked.
- Game removal: build green with `src/game/` gone; `#game` hash falls back to top-of-book; zero references to game symbols.

---

## Plan G — The Kid & the Ink Engine

### The character

A recurring Silverstein-style kid — nose-first profile, dot eyes, wild scribble hair, noodle limbs, enormous bare feet — appears in **every illustration** (chapters, beasts pages, cover). The Kid is a parameterized rig (`src/ink/kid.ts`): a pose function returns the geometric plan for head/hair/torso/limbs/feet given a pose name (`running`, `collapsed`, `climbing`, `sleeping`, `looking-up`, `dragging`, `mid-air`) plus scale/flip/lean parameters. Rig proportions (big head, bigger feet) are fixed constants so the Kid is recognizably the same person on every page.

### The ink engine (`src/ink/`)

Pure, deterministic geometry → SVG. Modules:

- `stroke.ts` — the core: takes a polyline/bezier centerline + options `{ width, taper, wobble, overshoot, seed }` and emits pen-plausible SVG path data. Two render modes: **centerline** (thin detail lines, rendered as stroked paths — these keep the existing dash-based draw-in) and **outline** (tapered strokes rendered as filled variable-width outlines for the confident main lines). Wobble displaces points via the drawing's `Rng` fork, never `Math.random`.
- `fills.ts` — `scribbleFill(blob)` (dense back-and-forth scribble clipped to a blob — hair, shadows, the Quiet's fog) and `hatchFill(blob, angle)` (ground, hillsides).
- `kid.ts` — the rig (above), emitting ordered strokes through `stroke.ts`.
- `scenes/` — one composition per chapter event type (16), plus 5 beast portraits and 1 cover scene. A scene module exports `scene(params, rng): OrderedStroke[]` where `params` carries chapter data (hill gain scales the hill's height; a streak of N trails N chalk X-marks; journey distance stretches the paper plane's dotted wake). Every composition puts the Kid mid-interaction with the chapter's subject. The gag per scene (implementers may refine staging in the visual gate, not the concept):

| Scene | The gag |
|---|---|
| first-run | the Kid tiptoeing off the edge of a giant blank page, one toe testing the white |
| last-run | the Kid closing an enormous door in the road itself, key in hand |
| longest-run | the road rolls up behind the Kid like a ribbon they're unspooling off a giant reel |
| fastest-run | the Kid's shoes have run on ahead; the Kid is airborne, horizontal, holding the laces like reins |
| hilliest-run | a hill so steep it folds over; the Kid climbs the underside like a ladder |
| earliest-run | the Kid drags the sleeping sun up over the horizon with a rope |
| latest-run | the Kid walks a leashed crescent moon like a dog, streetlamp watching |
| night-runs | the Kid runs across the sky itself, hopping star to star like stepping stones |
| false-starts | the Kid tangled in a giant shoelace knot the size of a boulder, one shoe on |
| quiet | the Kid asleep in an armchair made of the giant empty shoe, dust motes, a cobweb to the wall |
| streak | the Kid marching, chest out, trailing N chalk X-marks that stretch to the horizon |
| journey | the Kid rides a paper plane bareback above a tiny curved earth, wake dotted behind |
| month | the Kid buried to the waist in a calendar page's torn-off days, still running |
| route-champion | the Kid wears the same loop of road as a crown, arms raised |
| hill-beast | the hill is a sleeping beast with a switchback spine; the Kid stands on its snout, flag planted |
| ghost-elevation | a translucent staircase to nowhere; the Kid halfway up, looking back at the reader |
| beast: quiet | the Quiet as a huge soft blob with heavy-lidded eyes, absorbing an armchair |
| beast: hill | the hill-beast mid-yawn, switchback teeth |
| beast: night | a long-armed creature made of streetlamp light and moths |
| beast: false-start | a small gremlin proudly holding a stolen left shoe |
| beast: ghost | a politely floating sheet with running shoes on, mid-stride |
| cover | the Kid running along the book's own title rule-line as if it were pavement |
- `index.ts` — `renderScene(tag, params, rng): string` returning the final `<svg>` (viewBox 0 0 240 200; existing wobble filter retired for these — the engine's own wobble replaces `feTurbulence`).

```ts
export interface OrderedStroke {
  d: string;                    // path data
  mode: "centerline" | "outline";
  cls: string;                  // token class: ink / ink-faint / pencil
  order: number;                // draw-in sequence position
}
```

### Integration and animation

- `doodles.ts` static map is replaced by scene rendering; `book.ts`'s `doodleTags` becomes `sceneSpec` (tag + params). Chapters keep route/flight maps — maps stay, icons die.
- Draw-in upgrade in `src/living/reveal.ts`: strokes revealed in `order` sequence with stagger (feels like watching the page be drawn), character always last, total duration still paced by `drawDurationMs`. Reduced motion: everything visible immediately, as today.
- Share-PNG, theming (currentColor via token classes), and print continue to work; scenes must render identically in both themes (line color from tokens only).

### The visual gate (mandatory, per scene)

A harness script renders **every scene × both themes × small/large params** to PNGs. The controller (Claude) reviews each image visually and returns redraw notes; a scene ships only when approved by eye. This gate is a numbered step in every scene task — a scene reviewed only as code is an incomplete task.

### Tests (Plan G)

- Engine: determinism (same seed → identical path data); outline strokes are closed filled paths; wobble bounded (max displacement < 2.5 units); scribble/hatch stay inside their clip blobs (sampled-point test).
- Scenes: every tag renders non-empty; stroke counts within budget (< 400 strokes/scene for perf); params visibly change output (large hill ≠ small hill path data); all strokes use token classes only (no literal colors).
- Browser acceptance: draw-in ordering observed; both themes screenshot-diffed against approved goldens (structural: same stroke count, not pixel-perfect); share-PNG still embeds correctly; reduced-motion pass.

---

## Plan H — Deluxe Live Ink

### Behavior

- A "Deluxe ink" section in the existing toolbar/settings: paste an Anthropic API key (stored **only** in `localStorage` under `inkline.deluxe.key`; never in URLs; a "forget key" button removes it). Model fixed to `claude-haiku-4-5` (cost note in UI: "about 3¢ a book").
- When enabled and a book is built: the deterministic book renders **instantly and completely** as today. Then, per chapter, a live poem is requested; on arrival, the chapter's poem crossfades through an "ink rewrites itself" animation (existing reveal infra; reduced-motion: instant swap). Any failure (network, key invalid, malformed reply, rate limit) leaves the deterministic poem in place silently — a small pen-nib badge marks chapters that were rewritten live.

### Privacy contract (hard rules, test-enforced)

Request payload may contain **only**: event type, the chapter's already-formatted stat strings, generated names/titles, month name, time-of-day band (dawn/day/dusk/night), magnitude band, and the assigned `PoemForm`. It must **never** contain: latitude/longitude, raw timestamps, city coordinates, route geometry, file names, or any field not on the allowlist. A serializer with an explicit allowlist builds the payload; a test asserts a fully-populated chapter serializes to allowlisted keys only.

### API

- Direct browser → `https://api.anthropic.com/v1/messages` with the `anthropic-dangerous-direct-browser-access: true` header (Anthropic's supported CORS path). No proxy, no server, zero new dependencies.
- System prompt (authored in Plan H, versioned in-repo) encodes the house voice, the Silverstein register, the assigned form's structural rules, and the honesty rule (state only the numbers given). Response is parsed into `ChapterPoem`; a validator enforces form line-count bounds and the 60-char line limit; invalid → fallback.
- Requests are sequential with a small concurrency cap (2) to be polite; a book stops requesting after 3 consecutive failures.

### Tests (Plan H)

- Serializer allowlist test (above); validator tests (line bounds, form rules, malformed JSON → fallback); toggle-off sends zero requests (network log assert in browser acceptance); key never appears in DOM or exported PNGs; offline build fully functional with deluxe on but network down.

---

## Success criteria (the flip test)

1. Flipping through the demo book: **no two chapters share a poem form**, and no two spreads look alike.
2. Every illustration contains the Kid; a stranger should smile at at least one drawing (proxy: controller + opus reviewer both approve every scene visually).
3. Core mode: zero external network requests, deterministic snapshot stable across runs.
4. Deluxe mode on the user's real export: live poems arrive, reference the real stats, and never transmit anything off the allowlist.
5. All existing non-game guarantees hold: print, share-PNG, dark mode, reduced motion, mobile column.
