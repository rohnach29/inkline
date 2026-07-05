# Inkline Plan A: Foundation & Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested TypeScript `ingest` package that turns an Apple Health `export.zip` (or loose GPX text) into a clean, timezone-true `Year` model.

**Architecture:** Pure-function pipeline, no DOM dependencies (everything testable in Node, usable in the browser). Regex/chunk-based parsing instead of DOM/SAX libraries keeps the dependency count at two. Every function is deterministic.

**Tech Stack:** TypeScript (strict), Vitest, fflate (zip), tz-lookup (offline IANA timezone from coordinates).

**Plan series:** A (this plan) → B: Analyze & Storytell → C: Render & App Shell → D: Living Book → E: Outrun the Quiet game. Spec: `docs/superpowers/specs/2026-07-05-pavement-book-design.md`.

## Global Constraints

- TypeScript `strict: true`; no UI framework anywhere in the project.
- Runtime dependencies in this plan: `fflate`, `tz-lookup` — nothing else.
- All pipeline code must run in the browser; Node is used only for tests. No network calls in pipeline code.
- Determinism: no `Date.now()`, no `Math.random()`, no locale-dependent behavior (timezone conversions always pass an explicit IANA `timeZone`).
- **Timezone law (from spec):** a run's local time derives from its own first GPS coordinate via `tz-lookup`. Device clocks and filenames are never trusted. GPS-less runs use the fallback timezone and are flagged `timezoneUncertain: true`.
- Honesty rule: every number surfaced to users comes from the data.
- Per user's global rules: push after every commit (`git push`); verify exit code 0.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `src/types/tz-lookup.d.ts`, `src/scaffold.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run typecheck` that every later task relies on.

- [ ] **Step 1: Write config files**

`package.json`:

```json
{
  "name": "inkline",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fflate": "^0.8.2",
    "tz-lookup": "^6.1.25"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

Note: add `"globals": true` support by creating `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { globals: true },
});
```

`.gitignore`:

```
node_modules/
dist/
*.local
```

`src/types/tz-lookup.d.ts` (the package ships no types):

```ts
declare module "tz-lookup" {
  export default function tzlookup(lat: number, lon: number): string;
}
```

- [ ] **Step 2: Write the smoke test**

`src/scaffold.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("runs tests with strict TS", () => {
    const x: number = 2;
    expect(x + x).toBe(4);
  });
});
```

- [ ] **Step 3: Install and verify**

Run: `npm install && npm test && npm run typecheck`
Expected: 1 test passes; typecheck exits 0.

- [ ] **Step 4: Commit and push**

```bash
git add -A
git commit -m "chore: scaffold TypeScript + Vitest project"
git push
```

---

### Task 2: GPX track parser

**Files:**
- Create: `src/ingest/types.ts`, `src/ingest/gpx.ts`
- Test: `src/ingest/gpx.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface TrackPoint { lat: number; lon: number; ele: number; t: number }` (`t` = epoch ms UTC) and `parseGpx(xml: string): TrackPoint[]`. Used by Tasks 3, 4, 5, 8.

- [ ] **Step 1: Write the failing test**

`src/ingest/gpx.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseGpx } from "./gpx";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Apple Health Export">
  <trk><trkseg>
    <trkpt lon="72.919684" lat="19.096888"><ele>8.85</ele><time>2024-07-23T04:18:57Z</time><extensions><speed>0.94</speed></extensions></trkpt>
    <trkpt lon="72.919676" lat="19.096883"><ele>8.89</ele><time>2024-07-23T04:18:58Z</time></trkpt>
    <trkpt lat="19.096870" lon="72.919660"><time>2024-07-23T04:18:59Z</time></trkpt>
    <trkpt lon="72.919650" lat="19.096860"><ele>9.0</ele></trkpt>
  </trkseg></trk>
</gpx>`;

describe("parseGpx", () => {
  it("extracts points with lat/lon/ele/epoch-ms time", () => {
    const pts = parseGpx(SAMPLE);
    expect(pts).toHaveLength(3); // 4th has no <time>, dropped
    expect(pts[0]).toEqual({
      lat: 19.096888,
      lon: 72.919684,
      ele: 8.85,
      t: Date.parse("2024-07-23T04:18:57Z"),
    });
    expect(pts[2]!.ele).toBe(0); // missing <ele> defaults to 0
  });

  it("handles attribute order variation and returns [] for garbage", () => {
    expect(parseGpx("not xml at all")).toEqual([]);
    const pts = parseGpx(SAMPLE);
    expect(pts[2]!.lat).toBe(19.09687); // lat-before-lon variant parsed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/gpx.test.ts`
Expected: FAIL — cannot resolve `./gpx`.

- [ ] **Step 3: Write the implementation**

`src/ingest/types.ts`:

```ts
export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number;
  /** epoch milliseconds, UTC */
  t: number;
}

export interface Run {
  id: string;
  startUtc: number;
  /** local wall-clock ISO-like string, e.g. "2025-10-26T10:49:03" */
  startLocal: string;
  /** IANA timezone derived from GPS (timezone law) */
  tz: string;
  timezoneUncertain: boolean;
  km: number;
  minutes: number;
  elevationGain: number;
  indoor: boolean;
  track?: TrackPoint[];
  placeId: string | null;
}

export interface Place {
  id: string;
  lat: number;
  lon: number;
  runCount: number;
}

export interface Year {
  runs: Run[];
  places: Place[];
  span: { firstUtc: number; lastUtc: number };
}
```

`src/ingest/gpx.ts`:

```ts
import type { TrackPoint } from "./types";

const TRKPT_RE = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;

export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const m of xml.matchAll(TRKPT_RE)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const lat = attrs.match(/\blat="(-?[\d.]+)"/);
    const lon = attrs.match(/\blon="(-?[\d.]+)"/);
    const time = body.match(/<time>([^<]+)<\/time>/);
    if (!lat || !lon || !time) continue;
    const t = Date.parse(time[1]!);
    if (Number.isNaN(t)) continue;
    const ele = body.match(/<ele>(-?[\d.eE+]+)<\/ele>/);
    points.push({
      lat: parseFloat(lat[1]!),
      lon: parseFloat(lon[1]!),
      ele: ele ? parseFloat(ele[1]!) : 0,
      t,
    });
  }
  return points;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/gpx.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/types.ts src/ingest/gpx.ts src/ingest/gpx.test.ts
git commit -m "feat: GPX track parser"
git push
```

---

### Task 3: Track statistics

**Files:**
- Create: `src/ingest/stats.ts`
- Test: `src/ingest/stats.test.ts`

**Interfaces:**
- Consumes: `TrackPoint` from Task 2.
- Produces: `haversineM(a: {lat,lon}, b: {lat,lon}): number` (meters) and `trackStats(points: TrackPoint[]): { km: number; minutes: number; elevationGain: number }`. Used by Task 8; `haversineM` also used by place clustering.

- [ ] **Step 1: Write the failing test**

`src/ingest/stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { haversineM, trackStats } from "./stats";
import type { TrackPoint } from "./types";

describe("haversineM", () => {
  it("measures ~111 km per degree of latitude", () => {
    const d = haversineM({ lat: 19.0, lon: 72.9 }, { lat: 20.0, lon: 72.9 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("trackStats", () => {
  it("sums distance, duration from timestamps, and positive elevation only", () => {
    const t0 = Date.parse("2025-01-01T06:00:00Z");
    const pts: TrackPoint[] = [
      { lat: 19.0, lon: 72.9, ele: 10, t: t0 },
      { lat: 19.001, lon: 72.9, ele: 14, t: t0 + 30_000 },
      { lat: 19.002, lon: 72.9, ele: 12, t: t0 + 60_000 },
    ];
    const s = trackStats(pts);
    expect(s.km).toBeCloseTo(0.221, 2); // 2 × ~110.6 m
    expect(s.minutes).toBe(1);
    expect(s.elevationGain).toBe(4); // +4 up, -2 down ignored
  });

  it("returns zeros for fewer than 2 points", () => {
    expect(trackStats([])).toEqual({ km: 0, minutes: 0, elevationGain: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/stats.test.ts`
Expected: FAIL — cannot resolve `./stats`.

- [ ] **Step 3: Write the implementation**

`src/ingest/stats.ts`:

```ts
import type { TrackPoint } from "./types";

const EARTH_R = 6_371_000;
const toRad = (d: number): number => (d * Math.PI) / 180;

export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

export interface TrackStats {
  km: number;
  minutes: number;
  elevationGain: number;
}

export function trackStats(points: TrackPoint[]): TrackStats {
  if (points.length < 2) return { km: 0, minutes: 0, elevationGain: 0 };
  let meters = 0;
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    meters += haversineM(prev, cur);
    const dEle = cur.ele - prev.ele;
    if (dEle > 0) gain += dEle;
  }
  const minutes = (points[points.length - 1]!.t - points[0]!.t) / 60_000;
  return { km: meters / 1000, minutes, elevationGain: gain };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/stats.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/stats.ts src/ingest/stats.test.ts
git commit -m "feat: track distance/duration/elevation stats"
git push
```

---

### Task 4: Track downsampler (Douglas-Peucker)

**Files:**
- Create: `src/ingest/downsample.ts`
- Test: `src/ingest/downsample.test.ts`

**Interfaces:**
- Consumes: `TrackPoint` from Task 2.
- Produces: `downsample(points: TrackPoint[], toleranceM?: number): TrackPoint[]` (default tolerance 8 m). Used by Task 8. Stats are always computed on the RAW track (Task 3) before downsampling — downsampled tracks are for rendering only.

- [ ] **Step 1: Write the failing test**

`src/ingest/downsample.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { downsample } from "./downsample";
import type { TrackPoint } from "./types";

function pt(lat: number, lon: number, i: number): TrackPoint {
  return { lat, lon, ele: 0, t: i * 1000 };
}

describe("downsample", () => {
  it("collapses collinear points to endpoints", () => {
    const pts = Array.from({ length: 50 }, (_, i) =>
      pt(19.0 + i * 0.0001, 72.9, i),
    );
    const out = downsample(pts, 8);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[1]).toEqual(pts[49]);
  });

  it("keeps a significant corner", () => {
    const leg1 = Array.from({ length: 20 }, (_, i) => pt(19.0 + i * 0.0005, 72.9, i));
    const leg2 = Array.from({ length: 20 }, (_, i) => pt(19.0095, 72.9 + i * 0.0005, 20 + i));
    const out = downsample([...leg1, ...leg2], 8);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThan(10);
  });

  it("passes through tiny inputs unchanged", () => {
    const two = [pt(19, 72.9, 0), pt(19.1, 72.9, 1)];
    expect(downsample(two)).toEqual(two);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/downsample.test.ts`
Expected: FAIL — cannot resolve `./downsample`.

- [ ] **Step 3: Write the implementation**

`src/ingest/downsample.ts`:

```ts
import type { TrackPoint } from "./types";

/**
 * Douglas-Peucker simplification with tolerance in meters.
 * Uses a local planar approximation (fine for run-sized tracks).
 */
export function downsample(points: TrackPoint[], toleranceM = 8): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const cosLat = Math.cos((points[0]!.lat * Math.PI) / 180);
  const xs = points.map((p) => p.lon * 111_320 * cosLat);
  const ys = points.map((p) => p.lat * 110_540);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop()!;
    const ax = xs[s]!, ay = ys[s]!, bx = xs[e]!, by = ys[e]!;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = xs[i]!, py = ys[i]!;
      let d: number;
      if (len2 === 0) {
        d = Math.hypot(px - ax, py - ay);
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceM && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/downsample.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/downsample.ts src/ingest/downsample.test.ts
git commit -m "feat: Douglas-Peucker track downsampling"
git push
```

---

### Task 5: Run clock — timezone law

**Files:**
- Create: `src/ingest/clock.ts`
- Test: `src/ingest/clock.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone).
- Produces: `runClock(startUtc: number, firstPoint?: { lat: number; lon: number }, fallbackTz?: string): { tz: string; startLocal: string; timezoneUncertain: boolean }`. Used by Task 8. This function IS the spec's timezone law.

- [ ] **Step 1: Write the failing test**

`src/ingest/clock.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runClock } from "./clock";

describe("runClock (timezone law)", () => {
  it("derives Mumbai local time from coordinates", () => {
    const c = runClock(Date.parse("2024-07-23T04:18:57Z"), {
      lat: 19.096888,
      lon: 72.919684,
    });
    expect(c.tz).toBe("Asia/Kolkata");
    expect(c.startLocal).toBe("2024-07-23T09:48:57"); // UTC+5:30
    expect(c.timezoneUncertain).toBe(false);
  });

  it("turns the 'midnight' Indiana run into a morning run", () => {
    // The real bug this law exists for: filename said 12:46am IST,
    // the run actually started 10:49am Eastern.
    const c = runClock(Date.parse("2025-10-26T14:49:03Z"), {
      lat: 40.423,
      lon: -86.906,
    });
    expect(c.startLocal).toBe("2025-10-26T10:49:03"); // EDT, UTC-4
    expect(c.timezoneUncertain).toBe(false);
  });

  it("flags GPS-less runs as timezone-uncertain and uses the fallback", () => {
    const c = runClock(Date.parse("2025-01-01T12:00:00Z"), undefined, "Asia/Kolkata");
    expect(c.tz).toBe("Asia/Kolkata");
    expect(c.startLocal).toBe("2025-01-01T17:30:00");
    expect(c.timezoneUncertain).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/clock.test.ts`
Expected: FAIL — cannot resolve `./clock`.

- [ ] **Step 3: Write the implementation**

`src/ingest/clock.ts`:

```ts
import tzlookup from "tz-lookup";

export interface RunClock {
  tz: string;
  startLocal: string;
  timezoneUncertain: boolean;
}

/**
 * The timezone law: a run's local time comes from its own first GPS
 * coordinate. Device clocks, filenames, and export settings are never
 * trusted. GPS-less runs fall back and are flagged uncertain.
 */
export function runClock(
  startUtc: number,
  firstPoint?: { lat: number; lon: number },
  fallbackTz = "UTC",
): RunClock {
  const tz = firstPoint ? tzlookup(firstPoint.lat, firstPoint.lon) : fallbackTz;
  // sv-SE locale formats as "YYYY-MM-DD HH:mm:ss" — stable and parseable.
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(startUtc));
  return {
    tz,
    startLocal: formatted.replace(" ", "T"),
    timezoneUncertain: !firstPoint,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/clock.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/clock.ts src/ingest/clock.test.ts
git commit -m "feat: timezone law - local run time from GPS coordinates"
git push
```

---

### Task 6: Workout scanner for export.xml

**Files:**
- Create: `src/ingest/workouts.ts`
- Test: `src/ingest/workouts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone).
- Produces: `interface WorkoutRecord { activity: string; startUtc: number; endUtc: number; durationMin: number | null; km: number | null; indoor: boolean }`, `parseAppleDate(s: string): number`, and `class WorkoutScanner { push(chunk: string): void; readonly workouts: WorkoutRecord[] }`. Chunk-based so export.xml never needs a full-document XML parse. Used by Task 8.

- [ ] **Step 1: Write the failing test**

`src/ingest/workouts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { WorkoutScanner, parseAppleDate } from "./workouts";

const WORKOUT = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="34.79" durationUnit="min" sourceName="Watch" startDate="2024-08-22 02:19:51 +0530" endDate="2024-08-22 02:54:38 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="2024-08-22 02:19:51 +0530" endDate="2024-08-22 02:54:38 +0530" sum="5.25301" unit="km"/>
</Workout>`;

const INDOOR = `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="20.1" durationUnit="min" startDate="2025-01-05 07:00:00 +0530" endDate="2025-01-05 07:20:06 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
</Workout>`;

describe("parseAppleDate", () => {
  it("parses Apple's 'YYYY-MM-DD HH:mm:ss +ZZZZ' format", () => {
    expect(parseAppleDate("2024-08-22 02:19:51 +0530")).toBe(
      Date.parse("2024-08-21T20:49:51Z"),
    );
    expect(parseAppleDate("nonsense")).toBeNaN();
  });
});

describe("WorkoutScanner", () => {
  it("extracts complete workout records", () => {
    const s = new WorkoutScanner();
    s.push(`<HealthData>${WORKOUT}${INDOOR}</HealthData>`);
    expect(s.workouts).toHaveLength(2);
    const w = s.workouts[0]!;
    expect(w.activity).toBe("HKWorkoutActivityTypeRunning");
    expect(w.startUtc).toBe(Date.parse("2024-08-21T20:49:51Z"));
    expect(w.durationMin).toBeCloseTo(34.79);
    expect(w.km).toBeCloseTo(5.253, 3);
    expect(w.indoor).toBe(false);
    expect(s.workouts[1]!.indoor).toBe(true);
    expect(s.workouts[1]!.km).toBeNull();
  });

  it("survives a workout split across chunk boundaries", () => {
    const s = new WorkoutScanner();
    const whole = `<HealthData>${WORKOUT}</HealthData>`;
    const cut = whole.indexOf("endDate"); // split mid-attribute
    s.push(whole.slice(0, cut));
    s.push(whole.slice(cut));
    expect(s.workouts).toHaveLength(1);
    expect(s.workouts[0]!.km).toBeCloseTo(5.253, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/workouts.test.ts`
Expected: FAIL — cannot resolve `./workouts`.

- [ ] **Step 3: Write the implementation**

`src/ingest/workouts.ts`:

```ts
export interface WorkoutRecord {
  activity: string;
  startUtc: number;
  endUtc: number;
  durationMin: number | null;
  km: number | null;
  indoor: boolean;
}

const APPLE_DATE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/;

export function parseAppleDate(s: string): number {
  const m = s.match(APPLE_DATE_RE);
  if (!m) return NaN;
  return Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
}

function attr(el: string, name: string): string | null {
  const m = el.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1]! : null;
}

export function parseWorkoutElement(el: string): WorkoutRecord | null {
  const activity = attr(el, "workoutActivityType");
  const start = attr(el, "startDate");
  const end = attr(el, "endDate");
  if (!activity || !start || !end) return null;
  const startUtc = parseAppleDate(start);
  const endUtc = parseAppleDate(end);
  if (Number.isNaN(startUtc) || Number.isNaN(endUtc)) return null;

  const duration = attr(el, "duration");
  let km: number | null = null;
  const dist = el.match(
    /<WorkoutStatistics[^>]*DistanceWalkingRunning[^>]*\bsum="([\d.]+)"[^>]*\bunit="(km|mi)"/,
  );
  if (dist) {
    km = dist[2] === "km" ? parseFloat(dist[1]!) : parseFloat(dist[1]!) * 1.60934;
  } else {
    const legacy = attr(el, "totalDistance"); // older export format
    if (legacy) km = parseFloat(legacy);
  }
  return {
    activity,
    startUtc,
    endUtc,
    durationMin: duration ? parseFloat(duration) : null,
    km,
    indoor: /key="HKIndoorWorkout" value="1"/.test(el),
  };
}

const CLOSE = "</Workout>";

/** Feed export.xml in chunks of any size; never holds the whole file. */
export class WorkoutScanner {
  private buf = "";
  readonly workouts: WorkoutRecord[] = [];

  push(chunk: string): void {
    this.buf += chunk;
    let closeIdx: number;
    while ((closeIdx = this.buf.indexOf(CLOSE)) !== -1) {
      const openIdx = this.buf.lastIndexOf("<Workout ", closeIdx);
      if (openIdx === -1) {
        this.buf = this.buf.slice(closeIdx + CLOSE.length);
        continue;
      }
      const el = this.buf.slice(openIdx, closeIdx + CLOSE.length);
      const w = parseWorkoutElement(el);
      if (w) this.workouts.push(w);
      this.buf = this.buf.slice(closeIdx + CLOSE.length);
    }
    // Bound memory: keep only from the last unclosed <Workout, or a tail.
    const lastOpen = this.buf.lastIndexOf("<Workout ");
    if (lastOpen > 0) {
      this.buf = this.buf.slice(lastOpen);
    } else if (lastOpen === -1 && this.buf.length > 1_000_000) {
      this.buf = this.buf.slice(-CLOSE.length);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/workouts.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/workouts.ts src/ingest/workouts.test.ts
git commit -m "feat: chunked export.xml workout scanner"
git push
```

---

### Task 7: Export zip reader

**Files:**
- Create: `src/ingest/zip.ts`
- Test: `src/ingest/zip.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone).
- Produces: `interface RawExport { gpxFiles: Map<string, string>; exportXml: string | null }` and `readExportZip(data: Uint8Array): Promise<RawExport>`. Only `workout-routes/*.gpx` and `export.xml` entries are decompressed — everything else in the zip is skipped via fflate's filter. Used by Task 8 and by the app shell in Plan C.

- [ ] **Step 1: Write the failing test**

`src/ingest/zip.test.ts` (builds a real zip in memory with fflate):

```ts
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readExportZip } from "./zip";

function makeZip(): Uint8Array {
  return zipSync({
    "apple_health_export/export.xml": strToU8("<HealthData></HealthData>"),
    "apple_health_export/export_cda.xml": strToU8("<huge>ignored</huge>"),
    "apple_health_export/workout-routes/route_2024-07-23_10.03am.gpx":
      strToU8("<gpx>route1</gpx>"),
    "apple_health_export/electrocardiograms/ecg.csv": strToU8("ignored"),
  });
}

describe("readExportZip", () => {
  it("extracts only routes and export.xml, keyed by basename", async () => {
    const raw = await readExportZip(makeZip());
    expect(raw.exportXml).toBe("<HealthData></HealthData>");
    expect([...raw.gpxFiles.keys()]).toEqual(["route_2024-07-23_10.03am.gpx"]);
    expect(raw.gpxFiles.get("route_2024-07-23_10.03am.gpx")).toBe("<gpx>route1</gpx>");
  });

  it("handles a zip with no routes folder", async () => {
    const raw = await readExportZip(
      zipSync({ "apple_health_export/export.xml": strToU8("<HealthData/>") }),
    );
    expect(raw.gpxFiles.size).toBe(0);
    expect(raw.exportXml).toBe("<HealthData/>");
  });

  it("rejects on garbage bytes", async () => {
    await expect(readExportZip(new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/zip.test.ts`
Expected: FAIL — cannot resolve `./zip`.

- [ ] **Step 3: Write the implementation**

`src/ingest/zip.ts`:

```ts
import { unzip } from "fflate";

export interface RawExport {
  /** basename → GPX text */
  gpxFiles: Map<string, string>;
  exportXml: string | null;
}

const WANTED = /(workout-routes\/[^/]+\.gpx|(^|\/)export\.xml)$/;

export function readExportZip(data: Uint8Array): Promise<RawExport> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter: (f) => WANTED.test(f.name) }, (err, out) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const dec = new TextDecoder();
      const gpxFiles = new Map<string, string>();
      let exportXml: string | null = null;
      for (const [name, bytes] of Object.entries(out)) {
        if (name.endsWith(".gpx")) {
          gpxFiles.set(name.split("/").pop()!, dec.decode(bytes));
        } else {
          exportXml = dec.decode(bytes);
        }
      }
      resolve({ gpxFiles, exportXml });
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/zip.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit and push**

```bash
git add src/ingest/zip.ts src/ingest/zip.test.ts
git commit -m "feat: filtered in-memory reader for Apple Health export zips"
git push
```

---

### Task 8: Year builder — the ingest capstone

**Files:**
- Create: `src/ingest/year.ts`, `src/ingest/index.ts`
- Test: `src/ingest/year.test.ts`

**Interfaces:**
- Consumes: everything above — `parseGpx` (T2), `trackStats`/`haversineM` (T3), `downsample` (T4), `runClock` (T5), `WorkoutScanner` (T6), `RawExport` (T7).
- Produces: `buildYear(raw: RawExport): Year` and `assignPlaces(runs: Run[]): Place[]`; `src/ingest/index.ts` re-exports the public surface (`buildYear`, `readExportZip`, all types). Plan B consumes `Year` only through this module.

Rules implemented here:
- Route-to-workout matching: a workout matches a track when their time ranges overlap by more than half the track's duration; each workout matches at most one track.
- Distance/duration prefer the workout record (watch-authoritative) and fall back to raw-track stats; elevation always comes from the raw track (pre-downsampling).
- Unmatched running workouts become GPS-less runs (`timezoneUncertain: true`, fallback timezone `"Asia/Kolkata"` is NOT hardcoded — the most common tz among GPS runs is used, defaulting to `"UTC"` when there are none).
- Places: greedy clustering of run start points within 50 km (`haversineM`).

- [ ] **Step 1: Write the failing test**

`src/ingest/year.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildYear } from "./year";
import type { RawExport } from "./zip";

function gpx(points: Array<[number, number, string]>): string {
  const body = points
    .map(
      ([lat, lon, iso]) =>
        `<trkpt lon="${lon}" lat="${lat}"><ele>10</ele><time>${iso}</time></trkpt>`,
    )
    .join("\n");
  return `<gpx><trk><trkseg>${body}</trkseg></trk></gpx>`;
}

// 12-point Mumbai run, 2024-07-23 04:18:57Z → 04:29:57Z (11 min)
const MUMBAI = gpx(
  Array.from({ length: 12 }, (_, i) => [
    19.0969 + i * 0.001,
    72.9197,
    new Date(Date.parse("2024-07-23T04:18:57Z") + i * 60_000).toISOString().replace(".000", ""),
  ]),
);

// 12-point Indiana run, 2025-10-26 14:49:03Z
const INDIANA = gpx(
  Array.from({ length: 12 }, (_, i) => [
    40.423 + i * 0.001,
    -86.906,
    new Date(Date.parse("2025-10-26T14:49:03Z") + i * 60_000).toISOString().replace(".000", ""),
  ]),
);

const EXPORT_XML = `<HealthData>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="11.0" durationUnit="min" startDate="2024-07-23 09:48:57 +0530" endDate="2024-07-23 09:59:57 +0530">
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="1.99" unit="km"/>
</Workout>
<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30.0" durationUnit="min" startDate="2025-02-01 08:00:00 +0530" endDate="2025-02-01 08:30:00 +0530">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
</Workout>
<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60.0" durationUnit="min" startDate="2025-03-01 08:00:00 +0530" endDate="2025-03-01 09:00:00 +0530"/>
</HealthData>`;

function raw(): RawExport {
  return {
    gpxFiles: new Map([
      ["route_a.gpx", MUMBAI],
      ["route_b.gpx", INDIANA],
    ]),
    exportXml: EXPORT_XML,
  };
}

describe("buildYear", () => {
  it("builds runs from tracks with GPS-derived local times", () => {
    const year = buildYear(raw());
    const gps = year.runs.filter((r) => r.track);
    expect(gps).toHaveLength(2);
    expect(gps[0]!.tz).toBe("Asia/Kolkata");
    expect(gps[0]!.startLocal).toBe("2024-07-23T09:48:57");
    expect(gps[1]!.startLocal).toBe("2025-10-26T10:49:03"); // morning, not midnight
  });

  it("prefers workout distance over GPS distance when matched", () => {
    const year = buildYear(raw());
    expect(year.runs[0]!.km).toBe(1.99); // from workout, not track math
    expect(year.runs[0]!.minutes).toBe(11.0);
  });

  it("includes unmatched running workouts as GPS-less runs, excludes cycling", () => {
    const year = buildYear(raw());
    expect(year.runs).toHaveLength(3); // 2 GPS + 1 indoor; cycling dropped
    const indoor = year.runs.find((r) => r.indoor)!;
    expect(indoor.timezoneUncertain).toBe(true);
    expect(indoor.tz).toBe("Asia/Kolkata"); // majority tz of GPS runs? No — tie; earliest wins
  });

  it("clusters places and computes span", () => {
    const year = buildYear(raw());
    expect(year.places).toHaveLength(2); // Mumbai, Indiana
    expect(year.places[0]!.runCount).toBe(1);
    expect(year.span.firstUtc).toBe(Date.parse("2024-07-23T04:18:57Z"));
    expect(year.span.lastUtc).toBe(Date.parse("2025-10-26T14:49:03Z"));
  });

  it("returns an empty Year for an empty export", () => {
    const year = buildYear({ gpxFiles: new Map(), exportXml: null });
    expect(year.runs).toEqual([]);
    expect(year.places).toEqual([]);
    expect(year.span).toEqual({ firstUtc: 0, lastUtc: 0 });
  });
});
```

Note on the third test: with one Mumbai and one Indiana GPS run the timezone counts tie; the rule is "most common, ties broken by earliest run's timezone" — which is Mumbai's `Asia/Kolkata`. The comment documents this.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/year.test.ts`
Expected: FAIL — cannot resolve `./year`.

- [ ] **Step 3: Write the implementation**

`src/ingest/year.ts`:

```ts
import type { Place, Run, TrackPoint, Year } from "./types";
import type { RawExport } from "./zip";
import { parseGpx } from "./gpx";
import { trackStats, haversineM } from "./stats";
import { downsample } from "./downsample";
import { runClock } from "./clock";
import { WorkoutScanner, type WorkoutRecord } from "./workouts";

const MIN_TRACK_POINTS = 10;
const SCAN_CHUNK = 1_000_000;
const PLACE_RADIUS_M = 50_000;

interface ParsedTrack {
  name: string;
  points: TrackPoint[];
}

function scanWorkouts(xml: string): WorkoutRecord[] {
  const scanner = new WorkoutScanner();
  for (let i = 0; i < xml.length; i += SCAN_CHUNK) {
    scanner.push(xml.slice(i, i + SCAN_CHUNK));
  }
  return scanner.workouts.filter((w) => w.activity.includes("Running"));
}

function majorityTz(runs: Run[]): string {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.tz, (counts.get(r.tz) ?? 0) + 1);
  let best = "UTC";
  let bestCount = 0;
  for (const r of runs) {
    // iterate in run order so ties resolve to the earliest run's tz
    const c = counts.get(r.tz)!;
    if (c > bestCount) {
      best = r.tz;
      bestCount = c;
    }
  }
  return best;
}

export function assignPlaces(runs: Run[]): Place[] {
  const places: Place[] = [];
  for (const run of runs) {
    const p = run.track?.[0];
    if (!p) continue;
    let found = places.find((pl) => haversineM(pl, p) < PLACE_RADIUS_M);
    if (!found) {
      found = { id: `place-${places.length}`, lat: p.lat, lon: p.lon, runCount: 0 };
      places.push(found);
    }
    found.runCount++;
    run.placeId = found.id;
  }
  return places;
}

export function buildYear(raw: RawExport): Year {
  const tracks: ParsedTrack[] = [];
  for (const [name, xml] of raw.gpxFiles) {
    const points = parseGpx(xml);
    if (points.length >= MIN_TRACK_POINTS) tracks.push({ name, points });
  }
  tracks.sort((a, b) => a.points[0]!.t - b.points[0]!.t);

  const workouts = raw.exportXml ? scanWorkouts(raw.exportXml) : [];
  const used = new Set<number>();
  const runs: Run[] = [];

  for (const tr of tracks) {
    const t0 = tr.points[0]!.t;
    const t1 = tr.points[tr.points.length - 1]!.t;
    let match: WorkoutRecord | undefined;
    for (let i = 0; i < workouts.length; i++) {
      if (used.has(i)) continue;
      const w = workouts[i]!;
      const overlap = Math.min(t1, w.endUtc) - Math.max(t0, w.startUtc);
      if (overlap > 0.5 * (t1 - t0)) {
        match = w;
        used.add(i);
        break;
      }
    }
    const stats = trackStats(tr.points); // raw track: real elevation
    const clock = runClock(t0, tr.points[0]!);
    runs.push({
      id: tr.name.replace(/\.gpx$/, ""),
      startUtc: t0,
      startLocal: clock.startLocal,
      tz: clock.tz,
      timezoneUncertain: false,
      km: match?.km ?? stats.km,
      minutes: match?.durationMin ?? stats.minutes,
      elevationGain: stats.elevationGain,
      indoor: false,
      track: downsample(tr.points),
      placeId: null,
    });
  }

  const fallbackTz = majorityTz(runs);
  for (let i = 0; i < workouts.length; i++) {
    if (used.has(i)) continue;
    const w = workouts[i]!;
    const clock = runClock(w.startUtc, undefined, fallbackTz);
    runs.push({
      id: `workout-${w.startUtc}`,
      startUtc: w.startUtc,
      startLocal: clock.startLocal,
      tz: clock.tz,
      timezoneUncertain: true,
      km: w.km ?? 0,
      minutes: w.durationMin ?? (w.endUtc - w.startUtc) / 60_000,
      elevationGain: 0,
      indoor: w.indoor,
      placeId: null,
    });
  }

  runs.sort((a, b) => a.startUtc - b.startUtc);
  const places = assignPlaces(runs);
  return {
    runs,
    places,
    span:
      runs.length > 0
        ? { firstUtc: runs[0]!.startUtc, lastUtc: runs[runs.length - 1]!.startUtc }
        : { firstUtc: 0, lastUtc: 0 },
  };
}
```

`src/ingest/index.ts`:

```ts
export { buildYear, assignPlaces } from "./year";
export { readExportZip } from "./zip";
export type { RawExport } from "./zip";
export { parseGpx } from "./gpx";
export { runClock } from "./clock";
export type { Run, Place, Year, TrackPoint } from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/year.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests across all files PASS; tsc exits 0.

- [ ] **Step 6: Commit and push**

```bash
git add src/ingest/year.ts src/ingest/index.ts src/ingest/year.test.ts
git commit -m "feat: Year builder - ingest pipeline capstone"
git push
```

---

## Verification gate for this plan

All of the following, fresh, before Plan A is called complete:

1. `npm test` — every test passes, exit 0.
2. `npm run typecheck` — 0 errors.
3. `grep -rn "TODO\|FIXME\|not implemented" src/` — no matches.
4. `git log origin/main..HEAD --oneline` — empty (everything pushed).
5. Acceptance (manual, data stays local): a scratch script that runs `readExportZip` + `buildYear` on the author's real `export.zip` reports ~80 GPS runs, places in Mumbai/Indiana/Raleigh, and the 2025-10-26 long run starting at `10:49` local.
