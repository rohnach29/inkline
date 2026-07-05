# Plan B — Analyze & Storytell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a `Year` (from `src/ingest`) into a `Book` — a fully deterministic, serializable storybook model — via story-event detection (`src/analyze`) and a deterministic author (`src/storytell`).

**Architecture:** Two new packages. `analyze` is pure functions over `Year` emitting tagged `StoryEvent`s with evidence. `storytell` owns a seeded PRNG, naming grammars, a couplet-based verse library validated by a rhyme/syllable test gate, and a Book assembler that *selects* events (scoring by rarity/magnitude) rather than generating content. Every number printed comes from the data (honesty rule).

**Tech Stack:** TypeScript strict + `noUncheckedIndexedAccess`, Vitest. NO new runtime dependencies — the PRNG, rhyme families, and city centroid list are authored in-repo.

## Global Constraints

- Deterministic: same `Year` in → byte-identical `Book` out. NO `Date.now()`, NO `Math.random()`, no locale-dependent formatting (`toLocaleString` etc. banned; use manual formatting).
- No new runtime dependencies in `package.json`. No network calls. No LLMs.
- TypeScript strict mode with `noUncheckedIndexedAccess` must pass: `npx tsc --noEmit` → 0 errors.
- Honesty rule: every numeric value in `Book` output must be computed from the input `Year`. No invented stats.
- All quantities metric (km, meters). Distances printed rounded to 1 decimal unless stated otherwise.
- Consume ingest ONLY via `src/ingest/index.ts` public surface: `Run { id, startUtc, startLocal, tz, timezoneUncertain, km, minutes, elevationGain, indoor, track?, placeId }`, `TrackPoint { lat, lon, ele, t }`, `Place { id, lat, lon, runCount }`, `Year { runs, places, span }`. `startLocal` format: `"2025-10-26T10:49:03"`.
- `haversineM(a, b)` is importable from `src/ingest/stats.ts` (add it to `src/ingest/index.ts` exports in Task 2 — it takes `{lat, lon}`-shaped objects, returns meters).
- Tests colocated: `src/analyze/foo.test.ts` next to `src/analyze/foo.ts`.
- Commit style: `feat:`/`fix:`/`test:` prefixes, trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Never commit or read the author's personal health export in tests; fixtures are synthetic.

## File Structure

```
src/analyze/
  types.ts        StoryEvent, StoryEventType, Story, RouteCluster, Hill
  patterns.ts     records, first/last, night, quiets, streaks, false starts, months
  geo.ts          route clustering, hill detection, ghosts, journeys
  cities.ts       bundled city centroid list + nearestCity()
  index.ts        analyzeYear(year): Story  (orchestrator) + re-exports
src/storytell/
  rng.ts          hashString, seedFromYear, Rng class (fork-able streams)
  rhyme.ts        rhymeFamily(word), syllableCount(word|line)
  lexicon.ts      word banks (adjectives, nouns, beast parts, titles)
  names.ts        naming grammars for entities
  fragments.ts    authored couplet library (≥60 couplets = ≥120 lines)
  verse.ts        verseFor(event, ctx): string[] — couplet selection + slot filling
  book.ts         buildBook(year, story): Book — scoring, selection, assembly
  types.ts        Book, Chapter, MapSpec, ChapterStat, BeastEntry, Colophon
  index.ts        public surface for Plan C
src/fixtures/
  synthetic.ts    makeSyntheticYear(): Year — committed synthetic fixture builder
```

---

### Task B1: Seeded PRNG (`src/storytell/rng.ts`)

**Files:**
- Create: `src/storytell/rng.ts`, `src/storytell/rng.test.ts`

**Interfaces (Produces — later tasks rely on these EXACT signatures):**

```ts
/** FNV-1a 32-bit hash of a string. Always returns an unsigned 32-bit int. */
export function hashString(s: string): number;

/** Stable seed for a Year: hash of run ids + km (fixed 3-decimal) joined.
 *  seedFromYear(y) === hashString(y.runs.map(r => `${r.id}:${r.km.toFixed(3)}`).join("|")) */
export function seedFromYear(year: Year): number;

export class Rng {
  constructor(seed: number);
  /** next float in [0, 1) — mulberry32 core */
  next(): number;
  /** integer in [0, n) */
  int(n: number): number;
  /** pick one element; throws on empty array */
  pick<T>(arr: readonly T[]): T;
  /** new independent Rng seeded by hashString(`${this.seed}:${label}`) —
   *  forking with the same label twice gives identical streams;
   *  fork does NOT advance the parent stream. */
  fork(label: string): Rng;
}
```

Implementation notes: mulberry32 — `state = (state + 0x6D2B79F5) | 0` then the standard scramble; all math with `Math.imul` and `>>> 0`. Store the original seed on the instance (readonly `seed`) for `fork`.

- [ ] **Step 1:** Write failing tests in `rng.test.ts`:
  - `hashString` returns identical values for identical inputs, differs for `"a"` vs `"b"`, returns unsigned int (`>= 0`, `Number.isInteger`).
  - `hashString("")` is a number (does not throw).
  - Two `Rng(42)` instances produce identical first 10 `next()` values; `Rng(42)` vs `Rng(43)` differ within first 10.
  - `next()` always in `[0, 1)` over 1000 draws.
  - `int(6)` over 600 draws: every value 0–5 appears (sanity, not statistics).
  - `pick` on `["a"]` returns `"a"`; `pick([])` throws.
  - `fork("x")` twice from the same parent → identical streams; forking does not change the parent's subsequent `next()` sequence (compare against un-forked twin).
  - `seedFromYear` on a minimal hand-built `Year` (two fake runs) is stable and changes when a run's km changes.
- [ ] **Step 2:** Run `npx vitest run src/storytell/rng.test.ts` — expect FAIL (module not found).
- [ ] **Step 3:** Implement `rng.ts` per the interface above.
- [ ] **Step 4:** Run tests — expect PASS. Run `npx tsc --noEmit` — 0 errors.
- [ ] **Step 5:** Commit: `feat: seeded PRNG - deterministic authorship foundation`

---

### Task B2: Pattern detectors (`src/analyze/types.ts`, `src/analyze/patterns.ts`)

**Files:**
- Create: `src/analyze/types.ts`, `src/analyze/patterns.ts`, `src/analyze/patterns.test.ts`
- Modify: `src/ingest/index.ts` — add `export { haversineM } from "./stats";`
- Modify: `src/ingest/stats.test.ts` — add the deferred single-point `trackStats` test (returns `{km: 0, minutes: 0, elevationGain: 0}` for 1 point).

**Interfaces (Produces):**

```ts
// src/analyze/types.ts
export type StoryEventType =
  | "first-run" | "last-run"
  | "longest-run" | "fastest-run" | "hilliest-run"
  | "earliest-run" | "latest-run"
  | "night-runs" | "false-starts" | "quiet" | "streak"
  | "journey" | "month" | "route-champion" | "hill-beast" | "ghost-elevation";

export interface StoryEvent {
  type: StoryEventType;
  /** ids of evidence runs, chronological */
  runIds: string[];
  /** epoch ms used for chapter ordering (start of the event) */
  atUtc: number;
  /** type-specific scoring value (km, days, count, meters, minutes/km) */
  magnitude: number;
  /** type-specific evidence; every value derived from Year data */
  data: Record<string, string | number | boolean>;
}

export interface Story { events: StoryEvent[] }
```

```ts
// src/analyze/patterns.ts — all pure, all sort internally by startUtc, none mutate input
export function detectFirstLast(year: Year): StoryEvent[];
export function detectRecords(year: Year): StoryEvent[];
export function detectNightRuns(year: Year): StoryEvent[];
export function detectQuiets(year: Year): StoryEvent[];
export function detectStreaks(year: Year): StoryEvent[];
export function detectFalseStarts(year: Year): StoryEvent[];
export function detectMonths(year: Year): StoryEvent[];
```

**Exact behavioral rules (implement precisely; each rule gets a test):**

- `detectFirstLast`: `first-run` for min `startUtc` (data: `km`, `startLocal`, `placeId` or `""`), `last-run` for max. Empty `year.runs` → `[]` from EVERY detector (no throws).
- `detectRecords` (skip any record whose candidate pool is empty; each event's `data` carries the printed value):
  - `longest-run`: max `km` (km > 0). magnitude = km. data: `km`, `startLocal`.
  - `fastest-run`: min pace `minutes/km` among runs with `km >= 3 && minutes > 0`. magnitude = pace. data: `paceMinPerKm` (number, unrounded), `km`, `startLocal`.
  - `hilliest-run`: max `elevationGain` where gain > 0. magnitude = gain. data: `elevationGainM`, `startLocal`.
  - `earliest-run` / `latest-run`: min/max local time-of-day in seconds parsed from `startLocal.slice(11)`. Exclude runs with `timezoneUncertain`. magnitude = seconds-of-day. data: `localTime` (`"HH:MM"`), `startLocal`.
  - Ties on any record: earliest `startUtc` wins.
- `detectNightRuns`: runs with local hour `>= 22 || < 4` (from `startLocal.slice(11, 13)`), `timezoneUncertain === false`. If ≥ 1: ONE aggregate event, runIds = all night runs chronological, `atUtc` = first one, magnitude = count, data: `count`, `latestLocalTime` (`"HH:MM"` of the run closest to 02:00 — i.e. max of `(secondsOfDay + 7200) % 86400`... use: the run whose hour-shifted time `(secs - 22*3600 + 86400) % 86400` is LARGEST), `latestStartLocal` (that run's `startLocal`).
- `detectQuiets`: sort by `startUtc`; for consecutive pairs with gap > 21 days (`> 21 * 86400_000` ms) emit one `quiet` per gap. magnitude = whole days (`Math.floor(gapMs / 86400_000)`). `atUtc` = end of earlier run's start (use earlier run's `startUtc`). data: `days`, `fromLocal` (earlier run's `startLocal`), `toLocal`. runIds = [earlier.id, later.id].
- `detectStreaks`: consecutive local *dates* (`startLocal.slice(0, 10)`; multiple runs same date count once). Runs sorted by startUtc. A streak of ≥ 5 distinct consecutive dates → one `streak` event: magnitude = number of dates, data: `days`, `fromDate`, `toDate`, runIds = all runs in the streak.
- `detectFalseStarts`: runs with `0 < km < 1`. If ≥ 1: ONE aggregate event, magnitude = count, runIds chronological, data: `count`, `shortestKm` (min km, unrounded), `shortestStartLocal`.
- `detectMonths`: group by `startLocal.slice(0, 7)` (`"2025-10"`). One `month` event per month with ≥ 1 run: magnitude = summed km, `atUtc` = min startUtc in month, data: `month`, `runs` (count), `km` (sum, unrounded), `bestKm` (max single run km). Events sorted by month string.

- [ ] **Step 1:** Write a small in-file test helper `mkRun(partial): Run` (defaults: km 5, minutes 30, gain 20, indoor false, timezoneUncertain false, placeId null, id derived from startLocal) and failing tests covering EVERY rule above, including: empty year, tie-breaking (two 10.0 km runs → earlier wins), quiet at exactly 21 days NOT emitted / 22 days emitted, streak of 4 not emitted / 5 emitted, two-runs-same-day streak counting, night boundary 04:00 excluded / 03:59 included / 22:00 included, timezoneUncertain run excluded from earliest/latest/night.
- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3:** Implement `types.ts` + `patterns.ts`. Add `haversineM` to ingest index. Add the `trackStats` single-point test to `src/ingest/stats.test.ts`.
- [ ] **Step 4:** FULL suite `npx vitest run` PASS + `npx tsc --noEmit` clean.
- [ ] **Step 5:** Commit: `feat: pattern detectors - records, quiets, streaks, night runs`

---

### Task B3: Geo detectors + orchestrator (`src/analyze/geo.ts`, `src/analyze/cities.ts`, `src/analyze/index.ts`)

**Files:**
- Create: `src/analyze/geo.ts`, `src/analyze/geo.test.ts`, `src/analyze/cities.ts`, `src/analyze/cities.test.ts`, `src/analyze/index.ts`

**Interfaces (Consumes:** B2's types + detectors, `haversineM` from ingest. **Produces):**

```ts
// geo.ts
export interface RouteCluster { seedRunId: string; runIds: string[] }
export function clusterRoutes(year: Year): RouteCluster[];
export function detectRouteChampion(year: Year): StoryEvent[]; // 0 or 1 event
export interface Hill { gainM: number; lengthM: number; gradePct: number; lat: number; lon: number }
export function detectHill(track: readonly TrackPoint[]): Hill | null;
export function detectHillBeast(year: Year): StoryEvent[];     // 0 or 1 event
export function detectGhosts(year: Year): StoryEvent[];
export function detectJourneys(year: Year): StoryEvent[];

// cities.ts
export interface City { name: string; lat: number; lon: number }
export const CITIES: readonly City[]; // see rules
export function nearestCity(lat: number, lon: number): City | null; // null if > 300 km

// index.ts
export function analyzeYear(year: Year): Story; // runs ALL detectors (B2 + B3), events sorted by atUtc then type
export * from "./types";
```

**Exact behavioral rules:**

- **Route clustering:** For each run with a track: cell set = `Set` of `` `${Math.round(p.lat * 500)}|${Math.round(p.lon * 500)}` `` over all track points (~220 m cells). Iterate runs chronologically; compare against each existing cluster's SEED run cell set: `overlap = |A ∩ B| / min(|A|, |B|)`. Join first cluster with overlap ≥ 0.5, else start new cluster (this run becomes seed). Deterministic by construction. Runs without tracks are ignored.
- **route-champion:** the cluster with most runs, if count ≥ 3 (tie → earliest seed run). magnitude = count. runIds = cluster runs chronological. `atUtc` = seed run startUtc. data: `count`, `seedRunId`, `km` (seed run's km).
- **detectHill(track):** walk points accumulating a climb segment: extend while elevation is non-decreasing with tolerance (allow dips of ≤ 2 m from the segment's running max); a drop > 2 m below running max closes the segment. Segment gain = maxEle − startEle; length = summed haversine over its points. Return the max-gain segment as `Hill` (lat/lon of segment start) if gain ≥ 25 AND `gradePct = gain / length * 100 >= 3`; else null. Fewer than 2 points → null.
- **hill-beast:** compute `detectHill` per run-with-track; group hills by location cell `` `${Math.round(hill.lat * 200)}|${Math.round(hill.lon * 200)}` `` (~550 m). A cell with hills from ≥ 3 distinct runs is "recurring". Among recurring cells pick max mean gradePct (tie → max mean gainM, then lexicographic cell key). Emit one event: magnitude = mean gainM (rounded to integer), runIds = contributing runs chronological, `atUtc` = first, data: `gainM` (mean, integer), `gradePct` (mean, 1-decimal number), `times` (run count), `lat`, `lon`.
- **detectGhosts:** for each placeId with ≥ 5 tracked runs: median `elevationGain` of those runs; any run there with `elevationGain >= 200` AND `>= 4 * median` (median > 0 required... if median is 0 use threshold 200 alone) → one `ghost-elevation` event PER ghost run. magnitude = gain. data: `elevationGainM`, `medianM` (the median, 1-decimal), `startLocal`.
- **detectJourneys:** runs with tracks sorted by startUtc; for consecutive pairs where `haversineM(first point A, first point B) > 500_000` → `journey` event. magnitude = km (distance / 1000). `atUtc` = later run's startUtc. runIds = [earlier.id, later.id]. data: `km` (unrounded), `fromLat/fromLon/toLat/toLon` (first trackpoint coords), `fromCity` / `toCity` (nearestCity name, or `""` if null).
- **cities.ts:** author `CITIES` from general knowledge: ≈ 250–320 entries covering world capitals + major metros on every continent + notable US mid-size cities (MUST include: Mumbai, Indianapolis, Lafayette (Indiana), Chicago, Raleigh, Delhi, Bengaluru, Pune, New York, San Francisco, London, Tokyo). Coordinates to 2 decimals are fine. `nearestCity` = linear scan with `haversineM`, return null if best > 300 km.
- **analyzeYear:** concatenates all B2 + B3 detector outputs, sorts by `atUtc` ascending, ties by `type` lexicographic. Never throws on empty year (returns `{ events: [] }`).

- [ ] **Step 1:** Failing tests: synthetic tracks helper `mkTrack(points: [lat, lon, ele][], startT): TrackPoint[]` (1 s apart). Cover: two identical-path runs cluster together; a run 10 km away starts a new cluster; champion needs ≥ 3 (2 runs → no event); `detectHill` on a monotonic 50 m climb over 1 km → gain 50, grade ≈ 5; a 2 m dip does not split the climb; a 10 m drop does; flat track → null; ghost only when ≥ 5 runs at place AND ≥ 200 m AND ≥ 4× median; journey between Mumbai (19.08, 72.88) and West Lafayette (40.42, −86.92) tracks → one event, `fromCity` = "Mumbai", km ≈ 12800–13400; no journey for two runs 3 km apart; `nearestCity(19.08, 72.88)` → Mumbai; `nearestCity(0, -160)` (mid-Pacific) → null; `analyzeYear` on empty year → `{ events: [] }` and is sorted.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Full suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: geo detectors - routes, hills, ghosts, journeys + analyzeYear`

---

### Task B4: Naming grammars (`src/storytell/lexicon.ts`, `src/storytell/names.ts`)

**Files:**
- Create: `src/storytell/lexicon.ts`, `src/storytell/names.ts`, `src/storytell/names.test.ts`

**Interfaces (Consumes:** `Rng` from B1. **Produces):**

```ts
// names.ts — every function takes the BOOK-level rng and forks it internally
// with a label derived from the stable key, so name(k) is independent of call order:
//   const r = rng.fork(`name:${kind}:${key}`)
export function nameHill(rng: Rng, key: string): string;      // e.g. "Mount Regret", "The Unreasonable Hill"
export function nameRoute(rng: Rng, key: string): string;     // e.g. "The Usual", "The Tuesday Loop"
export function nameQuiet(rng: Rng, key: string, days: number): string; // e.g. "The Hundred-Day Quiet" (days >= 100), "The Long Quiet"
export function nameGhost(rng: Rng, key: string): string;     // e.g. "The Elevation Ghost", "The Hill That Wasn't"
export function nameNightBeast(rng: Rng, key: string, localTime: string): string; // MUST embed localTime, e.g. `The ${localTime}` -> "The 23:41"
export function bookTitle(rng: Rng): string;                  // e.g. "Where the Pavement Ends"
```

**Rules:**
- `lexicon.ts` holds the word banks as `readonly string[]` consts (each bank ≥ 8 entries, authored with Silverstein flavor — wry, concrete, kid-serious. Examples to include verbatim: hills → pattern banks so "Mount Regret" is producible; routes → "The Usual" producible; title bank MUST include "Where the Pavement Ends").
- Grammar = pick pattern via `r.pick(patterns)`, fill from banks via further `r.pick`. No number invention: any number in a name must come from arguments (`days`, `localTime`).
- `nameQuiet`: if `days >= 100`, name must reference scale (bank of "great/hundred-day/vast" patterns using the actual number only via wording like `The ${days}-Day Quiet` or non-numeric superlatives); else shorter-quiet bank.
- Same rng seed + same key → same name (order-independence via fork). Different keys → free to collide, but banks big enough that the test "10 distinct keys produce ≥ 6 distinct hill names" passes with seed 42 (author banks until it does).

- [ ] **Step 1:** Failing tests: order-independence (call `nameHill(rng, "b")` then `"a"` vs opposite order → same names); stability across two fresh Rng(7) instances; `nameNightBeast` embeds the exact time string; `nameQuiet(rng, k, 132)` contains "Quiet"; `bookTitle` non-empty; 10-key variety test above; every exported name function returns non-empty for 20 fuzz keys.
- [ ] **Step 2:** FAIL. **Step 3:** Implement lexicon + grammars. **Step 4:** Suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: naming grammars - hills, routes, quiets, beasts, title`

---

### Task B5: Verse engine (`src/storytell/rhyme.ts`, `src/storytell/fragments.ts`, `src/storytell/verse.ts`)

This is the craft task — the fragment library is the product. Fragments are authored writing in Shel Silverstein's register: concrete images, kid-logic, wry turns, never greeting-card. Written as COUPLETS (two lines that rhyme by construction); the engine selects couplets and fills slots; tests enforce rhyme, scan, and slot honesty.

**Files:**
- Create: `src/storytell/rhyme.ts`, `src/storytell/rhyme.test.ts`, `src/storytell/fragments.ts`, `src/storytell/verse.ts`, `src/storytell/verse.test.ts`

**Interfaces (Consumes:** `Rng`, `StoryEvent`. **Produces):**

```ts
// rhyme.ts
/** last word of a line, lowercased, punctuation stripped */
export function lastWord(line: string): string;
/** rhyme family key via curated rime-suffix table + exceptions map; "" if unknown */
export function rhymeFamily(word: string): string;
/** heuristic syllable count: vowel groups, silent-e, -le endings, y-as-vowel */
export function syllableCount(word: string): number;
export function lineSyllables(line: string): number; // sum over words

// fragments.ts
export type Mood = "triumphant" | "sheepish" | "nocturnal" | "quiet" | "absurd" | "steady";
export interface Couplet {
  a: string;          // line 1 — may contain {slot} tokens
  b: string;          // line 2 — rhymes with line 1
  mood: Mood;
  kinds: readonly StoryEventType[]; // event types this couplet suits ("*" not allowed; list them)
  role: "open" | "data" | "close";  // data couplets carry the number slots
}
export const COUPLETS: readonly Couplet[]; // >= 60 couplets (>= 120 lines)

// verse.ts
export interface VerseContext { name?: string; place?: string }
/** 4-6 line poem: open + data + close couplet (data omitted if no data couplet fits).
 *  Slot values formatted here: km -> 1 decimal, paceMinPerKm -> "M:SS /km", counts/days -> integer. */
export function verseFor(event: StoryEvent, ctx: VerseContext, rng: Rng): string[];
```

**Slot vocabulary** (verse.ts resolves ONLY these, from `event.data` / `ctx`; unknown slot in a selected couplet = thrown Error so tests catch it): `{km}`, `{days}`, `{count}`, `{month}` (from `"2025-10"` → `"October"` via fixed English array), `{pace}`, `{time}` (localTime), `{gain}`, `{name}`, `{place}`, `{year}` (from event data's startLocal/month slice).

**Library rules (tests enforce every one):**
1. ≥ 60 couplets; every mood has ≥ 6; every `StoryEventType` that book.ts makes chapters from (`first-run, last-run, longest-run, fastest-run, hilliest-run, earliest-run, latest-run, night-runs, false-starts, quiet, streak, journey, month, route-champion, hill-beast, ghost-elevation`) is covered by ≥ 2 open, ≥ 1 data, ≥ 2 close couplets (via `kinds`).
2. Rhyme gate: for EVERY couplet, `rhymeFamily(lastWord(a)) === rhymeFamily(lastWord(b))` and family ≠ `""`. Slots never appear as a line's final word.
3. Scan gate: `abs(lineSyllables(a) - lineSyllables(b)) <= 2` with slots filled by canonical test values (km→"12.3", days→"132", count→"7", month→"October", pace→"5:12 /km", time→"23:41", gain→"480", name→"Mount Regret", place→"Mumbai", year→"2025").
4. Honesty: `verseFor` fills slots only from `event.data`/`ctx`; a data couplet whose slots can't all be resolved for this event is filtered out BEFORE rng selection (so determinism doesn't depend on retry).
5. `verseFor` determinism: forks rng with `verse:${event.type}:${event.atUtc}`.

**Authoring bar — include these exemplar couplets verbatim in `fragments.ts` (they set the register; author the rest to match):**

```
open/quiet:      "The shoes sat by the door and did not ask." /
                 "The door knew better than to take them to task."
data/quiet:      "For {days} whole days the pavement went unread," /
                 "and grass grew tall on every word it said."
close/quiet:     "But quiet isn't empty — ask the snow." /
                 "It's just the road rehearsing where you'll go."
data/longest-run:"{km} kilometers — measured, mapped, and true," /
                 "and every single one of them by you."
open/night-runs: "The moon came out to check on who was out." /
                 "It found you, and it had its lamp about."
data/false-starts:"{count} runs that ended long before they should," /
                  "like pencils snapped while writing something good."
```

- [ ] **Step 1:** Write `rhyme.ts` failing tests first: `rhymeFamily("door") === rhymeFamily("floor")` ≠ `""`; `("true","you")` share family (exceptions map); `("said","unread")` share; `("snow","go")` share; `("good","should")` share; `("about","out")` share; `("orange")` → any consistent value; `syllableCount`: run 1, kilometers 5 (accept 4–5 via the test asserting your table's exceptions map handles it → pin exact: kilometers=5, quiet=2 (pin via exceptions if heuristic disagrees), pavement=2, rehearsing=3, measured=2. `lineSyllables("The moon came out") === 4`.
- [ ] **Step 2:** FAIL → implement `rhyme.ts` (suffix table ≈ 60–100 rime patterns + exceptions map for sight-rhyme pairs used by the library) → PASS.
- [ ] **Step 3:** Author `fragments.ts` (the ≥ 60 couplets), then `verse.test.ts` failing tests: the 5 library rules above as data-driven tests over `COUPLETS`, plus `verseFor` returns 4–6 lines, deterministic across two identical calls, all slots resolved (no `{` remains), unknown-slot couplet throws (craft a fake couplet through an internal fill function — export `fillSlots(line, values): string` from verse.ts for this).
- [ ] **Step 4:** Implement `verse.ts` → full suite + typecheck PASS. Fix any couplet the gates reject (fix the COUPLET, not the gate — the gates are the editor).
- [ ] **Step 5:** Commit: `feat: verse engine - rhyme gates + authored couplet library`

---

### Task B6: Book assembly (`src/storytell/types.ts`, `src/storytell/book.ts`, fixture, indexes)

**Files:**
- Create: `src/storytell/types.ts`, `src/storytell/book.ts`, `src/storytell/book.test.ts`, `src/storytell/index.ts`, `src/fixtures/synthetic.ts`
- Modify: `src/analyze/index.ts` only if exports missing.

**Interfaces (Consumes:** everything above. **Produces — Plan C renders EXACTLY this):**

```ts
// src/storytell/types.ts
export interface Book {
  seed: number;
  title: string;
  subtitle: string;               // fixed: "a year of running, drawn in ink"
  dedication: string[];           // 2-3 lines, references real places/counts
  chapters: Chapter[];            // chronological by event atUtc
  beasts: BeastEntry[];
  colophon: Colophon;
}
export interface Chapter {
  id: string;                     // `${event.type}:${event.atUtc}`
  kicker: string;                 // e.g. "in which the year begins"
  title: string;
  verse: string[];
  stats: ChapterStat[];           // honest numbers, already formatted
  mapSpec: MapSpec | null;
  doodleTags: string[];
  atmosphereTags: string[];
  eventType: StoryEventType;
}
export type MapSpec =
  | { kind: "route"; runId: string }
  | { kind: "flight"; from: LatLonName; to: LatLonName; km: number };
export interface LatLonName { lat: number; lon: number; name: string }
export interface ChapterStat { label: string; value: string }
export interface BeastEntry { name: string; kind: "quiet" | "hill" | "night" | "false-start" | "ghost"; description: string; doodleTag: string }
export interface Colophon { runCount: number; gpsRunCount: number; totalKm: number; places: string[]; note: string }

// src/storytell/book.ts
export function buildBook(year: Year, story: Story): Book;

// src/storytell/index.ts
export { buildBook } from "./book";
export { seedFromYear, Rng, hashString } from "./rng";
export type { Book, Chapter, MapSpec, ChapterStat, BeastEntry, Colophon, LatLonName } from "./types";
// src/fixtures/synthetic.ts
export function makeSyntheticYear(): Year;
```

**Selection & scoring rules:**
- Score = `TYPE_WEIGHT[type] * (1 + Math.log1p(magnitude))`. Weights: first-run 100 (always in), last-run 90 (always in), journey 80, quiet 70, longest-run 65, hill-beast 60, route-champion 55, night-runs 50, ghost-elevation 45, fastest-run 40, streak 35, false-starts 30, earliest-run 25, latest-run 25, hilliest-run 20, month 10.
- Take top-scoring events, cap 14 chapters, but at most 3 `month` chapters (highest-km months). Chapters then ordered by `atUtc`.
- Chapter fields: `kicker` from a fixed per-type map (authored in book.ts, e.g. first-run → "in which the year begins", quiet → "in which nothing happens, loudly"); `title` from names.ts where an entity exists (quiet → nameQuiet, hill-beast → nameHill, route-champion → nameRoute, night-runs → nameNightBeast, ghost → nameGhost) else from a per-type title grammar fork (`rng.fork(\`title:${chapter.id}\`)`) over small authored banks; `verse` via `verseFor(event, {name, place}, rng)`; `stats` per type (e.g. longest-run → `[{label: "distance", value: "33.4 km"}, {label: "when", value: "October 26, 10:49"}]` — format helpers authored in book.ts: `fmtKm(n)` → 1 decimal + " km", `fmtDateLocal(startLocal)` → "October 26, 10:49" via fixed English month array).
- `mapSpec`: events with a single evidence run that has a track → `{kind: "route", runId}`; journey → flight spec from event data (names from `fromCity`/`toCity`, `"far away"` if empty). Aggregate events (night-runs, false-starts): use the LAST runId with a track, else null.
- `doodleTags` per type (fixed map): first-run ["shoes"], night-runs ["moon","stars"], quiet ["empty-shoes"], journey ["plane","globe"], hill-beast ["hills"], month ["calendar"], false-starts ["banana"], ghost-elevation ["ghost"], longest-run ["trophy"], streak ["chain"], fastest-run ["wind"], others [].
- `atmosphereTags` (data-derived, honesty rule): "monsoon" if chapter's first evidence run is in a place with lat 8–25 AND lon 68–90 AND local month Jun–Sep; "fireflies" if eventType night-runs; "leaves" if local month Oct–Nov and place lat > 30; "snow" if local month Dec–Feb and place lat > 30. Place = year.places lookup by run.placeId; no place → no atmosphere.
- `beasts`: one entry per distinct beast present: every `quiet` chapter's name (kind quiet, doodleTag "empty-shoes"), hill-beast (kind hill, "hills"), night-runs (kind night, "moon"), false-starts (kind false-start, "banana"), ghost (kind ghost, "ghost"). Description = one authored template per kind with honest numbers filled (e.g. quiet: `"${days} days without a single footfall."`).
- `dedication`: authored template using real data: `["for the roads of ${placeNames.join(" and ")}", "and the ${runCount} runs that drew them"]` (place names via `nearestCity` on place coords, skip unnamed).
- `colophon.note` fixed: "made entirely in your browser; your data never left this page". `totalKm` = sum of run km rounded to 1 decimal. `places` = named places (nearestCity), deduped, order of `year.places`.
- Empty/tiny years: 0 runs → Book with title, dedication `["for the year that almost ran"]`, 0 chapters, colophon zeros; < 3 runs → normal path (selection just yields few chapters) plus subtitle becomes "a very short book of running". Never throw.
- `makeSyntheticYear()`: hand-authored deterministic fixture (NO rng): ~14 runs across two fake places (a coastal city at 19.08/72.88 and a college town at 40.42/-86.92) spanning Jan–Dec 2025, engineered to trigger: 1 journey, 1 quiet (40 days), 1 streak (6 days), 2 false starts, 2 night runs, a longest (21.1 km), a repeated route (4 identical-track runs), a hill (build a 60 m climb into one track), a ghost (one 300 m-gain run among flat ones — needs ≥ 5 tracked runs at that place). Tracks: small synthetic loops of 20–40 points. Include realistic `startLocal`/`tz` values consistent with coords (Asia/Kolkata, America/Indiana/Indianapolis) — hand-write them, do not call tz code.

- [ ] **Step 1:** Failing tests: `buildBook` on `makeSyntheticYear()` + `analyzeYear` → chapters.length between 8 and 14; first chapter eventType "first-run"; chapters strictly ordered by atUtc; a journey chapter exists with flight mapSpec and km > 500; a quiet chapter exists whose title contains "Quiet"; every chapter verse length 4–6 and contains no "{"; every stats value contains a digit (honesty smoke); beasts non-empty and include a quiet beast; colophon.totalKm equals hand-summed fixture total (1 decimal); determinism: two `buildBook` calls → `JSON.stringify` identical; GOLDEN: `expect(book).toMatchSnapshot()` (commit the snapshot); empty year → no throw, 0 chapters; 2-run year → subtitle "a very short book of running".
- [ ] **Step 2:** FAIL. **Step 3:** Implement `types.ts`, `book.ts`, fixture, `index.ts`. **Step 4:** FULL suite + typecheck PASS.
- [ ] **Step 5:** Commit: `feat: book assembly - the deterministic author`

---

## Acceptance (controller runs after all tasks)

Scratchpad script: load real export → `buildYear` → `analyzeYear` → `buildBook` → print title, chapter list (kicker/title/eventType), one full verse, beasts, colophon. Verify: the 132-day Quiet appears; the 33.4 km longest run appears with correct local date; a Mumbai↔Indiana journey chapter exists; no `{` anywhere in output; run twice → identical JSON.
