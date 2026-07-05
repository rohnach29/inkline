import type { Run, Year } from "../ingest";
import type { StoryEvent, StoryEventType, Story } from "../analyze/types";
import { nearestCity } from "../analyze/cities";
import { Rng, seedFromYear } from "./rng";
import { nameHill, nameRoute, nameQuiet, nameGhost, nameNightBeast, bookTitle } from "./names";
import { verseFor } from "./verse";
import type { Book, Chapter, MapSpec, ChapterStat, BeastEntry, Colophon, LatLonName } from "./types";

const MAX_CHAPTERS = 14;

/**
 * Per-type selection caps, applied WITHIN each type by (magnitude desc,
 * atUtc asc) before the global weight-dominant cut. Real exports can emit
 * many journeys/quiets; uncapped, their high weights crowd out every other
 * chapter. Types absent from this map are uncapped.
 */
const SELECTION_CAPS: Partial<Record<StoryEventType, number>> = {
  journey: 2,
  quiet: 3,
  "ghost-elevation": 1,
  streak: 2,
  month: 3,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const TYPE_WEIGHT: Record<StoryEventType, number> = {
  "first-run": 100,
  "last-run": 90,
  journey: 80,
  quiet: 70,
  "longest-run": 65,
  "hill-beast": 60,
  "route-champion": 55,
  "night-runs": 50,
  "ghost-elevation": 45,
  "fastest-run": 40,
  streak: 35,
  "false-starts": 30,
  "earliest-run": 25,
  "latest-run": 25,
  "hilliest-run": 20,
  month: 10,
};

// -------------------------------------------------------------------------
// Number formatting — fixed, deterministic, no locale APIs.
// -------------------------------------------------------------------------

function num(v: string | number | boolean | undefined): number {
  if (v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function str(v: string | number | boolean | undefined): string {
  return v === undefined ? "" : String(v);
}

function fmtKm(n: number): string {
  return `${n.toFixed(1)} km`;
}

/** "October 26, 10:49" from a "YYYY-MM-DDTHH:MM:SS" local string. */
function fmtDateLocal(startLocal: string): string {
  const monthIdx = Number(startLocal.slice(5, 7)) - 1;
  const day = Number(startLocal.slice(8, 10));
  const hm = startLocal.slice(11, 16);
  const month = MONTH_NAMES[monthIdx] ?? "January";
  return `${month} ${day}, ${hm}`;
}

/** "October 26" from a "YYYY-MM-DD" date-only string. */
function fmtDateOnly(dateStr: string): string {
  const monthIdx = Number(dateStr.slice(5, 7)) - 1;
  const day = Number(dateStr.slice(8, 10));
  const month = MONTH_NAMES[monthIdx] ?? "January";
  return `${month} ${day}`;
}

/** "M:SS /km" from minutes-per-km. */
function fmtPace(minPerKm: number): string {
  let minutes = Math.floor(minPerKm);
  let seconds = Math.round((minPerKm - minutes) * 60);
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

// -------------------------------------------------------------------------
// Selection — strict weight dominance
// -------------------------------------------------------------------------

/**
 * Type weight is editorial priority and strictly dominates: a lower-weight
 * type can never outrank a higher-weight one, no matter its magnitude.
 * Magnitude only ranks events WITHIN a type (which quiets/months make the
 * cut); atUtc asc is the final deterministic tie-break.
 */
export function compareByPriority(a: StoryEvent, b: StoryEvent): number {
  const wa = TYPE_WEIGHT[a.type];
  const wb = TYPE_WEIGHT[b.type];
  if (wa !== wb) return wb - wa;
  if (a.type === b.type && a.magnitude !== b.magnitude) return b.magnitude - a.magnitude;
  if (a.atUtc !== b.atUtc) return a.atUtc - b.atUtc;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return 0;
}

function compareByAtUtc(a: StoryEvent, b: StoryEvent): number {
  if (a.atUtc !== b.atUtc) return a.atUtc - b.atUtc;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return 0;
}

/**
 * Enforce SELECTION_CAPS: for each capped type, keep only the top-N events
 * WITHIN that type by (magnitude desc, atUtc asc) — which is exactly what
 * compareByPriority yields for same-type events. Uncapped types and event
 * order are otherwise preserved (the caller re-sorts anyway).
 */
function applyTypeCaps(events: StoryEvent[]): StoryEvent[] {
  const cappedByType = new Map<StoryEventType, StoryEvent[]>();
  const out: StoryEvent[] = [];
  for (const event of events) {
    if (SELECTION_CAPS[event.type] === undefined) {
      out.push(event);
      continue;
    }
    const group = cappedByType.get(event.type);
    if (group) group.push(event);
    else cappedByType.set(event.type, [event]);
  }
  for (const [type, group] of cappedByType) {
    group.sort(compareByPriority);
    out.push(...group.slice(0, SELECTION_CAPS[type]));
  }
  return out;
}

/**
 * first-run/last-run are always forced in (their weights of 100/90 make
 * this true anyway under strict weight dominance, but forcing them keeps
 * the guarantee explicit and cheap). Per-type SELECTION_CAPS are applied
 * first (top-N within each capped type by magnitude desc, atUtc asc). The
 * combined pool is then cut to the overall 14-chapter cap by priority, and
 * the final selection is re-sorted chronologically.
 */
export function selectEvents(events: StoryEvent[]): StoryEvent[] {
  const forced = events.filter((e) => e.type === "first-run" || e.type === "last-run");
  const rest = events.filter((e) => e.type !== "first-run" && e.type !== "last-run");

  const pool = applyTypeCaps(rest).sort(compareByPriority);
  const remainingSlots = Math.max(0, MAX_CHAPTERS - forced.length);
  const chosenFromPool = pool.slice(0, remainingSlots);

  const selected = [...forced, ...chosenFromPool];
  selected.sort(compareByAtUtc);
  return selected;
}

// -------------------------------------------------------------------------
// Fixed per-type maps
// -------------------------------------------------------------------------

const KICKER: Record<StoryEventType, string> = {
  "first-run": "in which the year begins",
  "last-run": "in which the year comes home",
  "longest-run": "in which the distance gets away from you",
  "fastest-run": "in which the wind gives up first",
  "hilliest-run": "in which the ground gets ideas",
  "earliest-run": "in which the dawn is beaten to the punch",
  "latest-run": "in which the day gets away first",
  "night-runs": "in which the dark keeps you company",
  "false-starts": "in which the shoes get put back on",
  quiet: "in which nothing happens, loudly",
  streak: "in which the mornings pile up",
  journey: "in which the map gets crowded",
  month: "in which a month goes by, quickly",
  "route-champion": "in which one road becomes a habit",
  "hill-beast": "in which a hill becomes a rival",
  "ghost-elevation": "in which the watch imagines things",
};

const DOODLE_TAGS: Record<StoryEventType, string[]> = {
  "first-run": ["shoes"],
  "last-run": [],
  "longest-run": ["trophy"],
  "fastest-run": ["wind"],
  "hilliest-run": [],
  "earliest-run": [],
  "latest-run": [],
  "night-runs": ["moon", "stars"],
  "false-starts": ["banana"],
  quiet: ["empty-shoes"],
  streak: ["chain"],
  journey: ["plane", "globe"],
  month: ["calendar"],
  "route-champion": [],
  "hill-beast": ["hills"],
  "ghost-elevation": ["ghost"],
};

/**
 * The 5 types whose titles are generated procedurally (see NAMED_ENTITY_TYPES
 * below) rather than picked from a fixed bank. Every other StoryEventType
 * MUST have a TITLE_BANKS entry — kept as a total Record (not Partial) so a
 * missing entry is a compile error, not a silent runtime fallback.
 */
type NamedEntityType = "quiet" | "hill-beast" | "route-champion" | "night-runs" | "ghost-elevation";

const TITLE_BANKS: Record<Exclude<StoryEventType, NamedEntityType>, readonly string[]> = {
  "first-run": ["The First Step", "Day One, More or Less", "Shoes, Untied", "The Opening Lace-Up"],
  "last-run": ["The Last Lap", "One More, For the Road", "The Closing Mile", "Where the Year Sets Down"],
  "longest-run": ["The Long Way Round", "The One That Kept Going", "A Distance With No Ending", "The Marathon of Second-Guessing"],
  "fastest-run": ["The Blur", "Outrunning the Clock", "The One Where the Wind Lost", "Faster Than the Excuse"],
  "hilliest-run": ["The Argument With Gravity", "Up, Mostly", "The Grade That Complained"],
  "earliest-run": ["Before the Rooster", "The Dawn Patrol", "Up Before the Sun Clocked In"],
  "latest-run": ["The Afternoon Outbid It", "Later Than Planned", "The Day That Got Away"],
  "false-starts": ["The Ones That Didn't Take", "Two Steps and a Shrug", "The Almost-Runs"],
  streak: ["The Stubborn Streak", "Six Mornings in a Row", "The Habit That Stuck"],
  journey: ["The Long Way Somewhere Else", "A Very Large Commute", "Halfway Around, Give or Take"],
  month: ["A Month, Accounted For", "Thirty Days, Roughly", "The Month That Added Up"],
};

// -------------------------------------------------------------------------
// Helpers over Year data
// -------------------------------------------------------------------------

function buildRunById(year: Year): Map<string, Run> {
  return new Map(year.runs.map((r) => [r.id, r] as const));
}

function buildPlaceById(year: Year): Map<string, Year["places"][number]> {
  return new Map(year.places.map((p) => [p.id, p] as const));
}

/** Deduped named places, in year.places order, skipping unnamed ones. */
function namedPlaces(year: Year): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const place of year.places) {
    const city = nearestCity(place.lat, place.lon);
    if (!city) continue;
    if (seen.has(city.name)) continue;
    seen.add(city.name);
    names.push(city.name);
  }
  return names;
}

function firstEvidenceRun(event: StoryEvent, runById: Map<string, Run>): Run | undefined {
  const id = event.runIds[0];
  return id !== undefined ? runById.get(id) : undefined;
}

function lastTrackedRunId(event: StoryEvent, runById: Map<string, Run>): string | null {
  for (let i = event.runIds.length - 1; i >= 0; i--) {
    const id = event.runIds[i];
    const run = id !== undefined ? runById.get(id) : undefined;
    if (run?.track && run.track.length > 0) return run.id;
  }
  return null;
}

/**
 * Multi-run aggregate events resolve to the LAST evidence run with a track —
 * intentionally: for a quiet, that's the run that ended the silence; for
 * night-runs/false-starts/streaks/champions it's the most recent sighting.
 */
function computeMapSpec(event: StoryEvent, runById: Map<string, Run>): MapSpec | null {
  if (event.type === "journey") {
    const fromLat = num(event.data.fromLat ?? 0);
    const fromLon = num(event.data.fromLon ?? 0);
    const toLat = num(event.data.toLat ?? 0);
    const toLon = num(event.data.toLon ?? 0);
    const fromName = String(event.data.fromCity ?? "") || "far away";
    const toName = String(event.data.toCity ?? "") || "far away";
    const from: LatLonName = { lat: fromLat, lon: fromLon, name: fromName };
    const to: LatLonName = { lat: toLat, lon: toLon, name: toName };
    return { kind: "flight", from, to, km: num(event.data.km ?? 0) };
  }

  if (event.runIds.length === 1) {
    const run = runById.get(event.runIds[0]!);
    if (run?.track && run.track.length > 0) return { kind: "route", runId: run.id };
    return null;
  }

  const runId = lastTrackedRunId(event, runById);
  return runId !== null ? { kind: "route", runId } : null;
}

function isMonsoonRegion(lat: number, lon: number): boolean {
  return lat >= 8 && lat <= 25 && lon >= 68 && lon <= 90;
}

function computeAtmosphereTags(event: StoryEvent, runById: Map<string, Run>, placeById: Map<string, Year["places"][number]>): string[] {
  const tags: string[] = [];
  if (event.type === "night-runs") tags.push("fireflies");

  const run = firstEvidenceRun(event, runById);
  if (!run || run.placeId === null) return tags;
  const place = placeById.get(run.placeId);
  if (!place) return tags;

  const month = Number(run.startLocal.slice(5, 7));
  if (isMonsoonRegion(place.lat, place.lon) && month >= 6 && month <= 9) tags.push("monsoon");
  if (place.lat > 30 && (month === 10 || month === 11)) tags.push("leaves");
  if (place.lat > 30 && (month === 12 || month === 1 || month === 2)) tags.push("snow");

  return tags;
}

function statsFor(event: StoryEvent, runById: Map<string, Run>): ChapterStat[] {
  const d = event.data;
  switch (event.type) {
    case "first-run":
    case "last-run":
      return [
        { label: "distance", value: fmtKm(num(d.km)) },
        { label: "when", value: fmtDateLocal(str(d.startLocal)) },
      ];
    case "longest-run":
      return [
        { label: "distance", value: fmtKm(num(d.km)) },
        { label: "when", value: fmtDateLocal(str(d.startLocal)) },
      ];
    case "fastest-run":
      return [
        { label: "pace", value: fmtPace(num(d.paceMinPerKm)) },
        { label: "distance", value: fmtKm(num(d.km)) },
      ];
    case "hilliest-run":
      return [
        { label: "climb", value: `${Math.round(num(d.elevationGainM))} m` },
        { label: "when", value: fmtDateLocal(str(d.startLocal)) },
      ];
    case "earliest-run":
    case "latest-run":
      return [
        { label: "time", value: str(d.localTime) },
        { label: "when", value: fmtDateLocal(str(d.startLocal)) },
      ];
    case "night-runs":
      return [
        { label: "nights", value: `${Math.round(num(d.count))} nights` },
        { label: "latest", value: str(d.latestLocalTime) },
      ];
    case "false-starts":
      return [
        { label: "count", value: `${Math.round(num(d.count))} runs` },
        { label: "shortest", value: fmtKm(num(d.shortestKm)) },
      ];
    case "quiet":
      return [
        { label: "silence", value: `${Math.round(num(d.days))} days` },
        { label: "from", value: fmtDateLocal(str(d.fromLocal)) },
      ];
    case "streak":
      return [
        { label: "length", value: `${Math.round(num(d.days))} days` },
        { label: "from", value: fmtDateOnly(str(d.fromDate)) },
      ];
    case "journey": {
      const lastId = event.runIds[event.runIds.length - 1];
      const run = lastId !== undefined ? runById.get(lastId) : undefined;
      const stats: ChapterStat[] = [{ label: "distance", value: fmtKm(num(d.km)) }];
      if (run) stats.push({ label: "when", value: fmtDateLocal(run.startLocal) });
      return stats;
    }
    case "month":
      return [
        { label: "distance", value: fmtKm(num(d.km)) },
        { label: "runs", value: `${Math.round(num(d.runs))} runs` },
      ];
    case "route-champion":
      return [
        { label: "runs", value: `${Math.round(num(d.count))} times` },
        { label: "distance", value: fmtKm(num(d.km)) },
      ];
    case "hill-beast":
      return [
        { label: "climb", value: `${Math.round(num(d.gainM))} m` },
        { label: "grade", value: `${num(d.gradePct)}%` },
        { label: "times", value: `${Math.round(num(d.times))} times` },
      ];
    case "ghost-elevation":
      return [
        { label: "climb", value: `${Math.round(num(d.elevationGainM))} m` },
        { label: "when", value: fmtDateLocal(str(d.startLocal)) },
      ];
    default:
      return [];
  }
}

const NAMED_ENTITY_TYPES: ReadonlySet<StoryEventType> = new Set<NamedEntityType>([
  "quiet",
  "hill-beast",
  "route-champion",
  "night-runs",
  "ghost-elevation",
]);

const MAX_NAME_REDRAWS = 8;

/**
 * Draw a name via `gen(key)`; if it's already used, redraw deterministically
 * with `key#2`, `key#3`, ... (the name functions fork the rng by key, so a
 * suffixed key is a fresh, stable draw). After MAX_NAME_REDRAWS collisions,
 * fall back to appending " (Again)" — still deterministic. The winning name
 * is recorded in `used`.
 */
export function dedupName(used: Set<string>, gen: (key: string) => string, baseKey: string): string {
  let name = gen(baseKey);
  for (let attempt = 2; used.has(name) && attempt <= MAX_NAME_REDRAWS; attempt++) {
    name = gen(`${baseKey}#${attempt}`);
  }
  if (used.has(name)) name = `${name} (Again)`;
  used.add(name);
  return name;
}

function titleFor(event: StoryEvent, chapterId: string, rng: Rng, usedNames: Set<string>): string {
  switch (event.type) {
    case "quiet":
      return dedupName(usedNames, (k) => nameQuiet(rng, k, num(event.data.days)), chapterId);
    case "hill-beast":
      return dedupName(usedNames, (k) => nameHill(rng, k), chapterId);
    case "route-champion":
      return dedupName(usedNames, (k) => nameRoute(rng, k), chapterId);
    case "night-runs":
      return dedupName(usedNames, (k) => nameNightBeast(rng, k, str(event.data.latestLocalTime)), chapterId);
    case "ghost-elevation":
      return dedupName(usedNames, (k) => nameGhost(rng, k), chapterId);
    default: {
      // Exhaustive by construction: TITLE_BANKS is typed as a total Record
      // over every StoryEventType not handled above, so this can't be
      // undefined — no fallback needed, and a new type left off TITLE_BANKS
      // fails to compile instead of failing silently at runtime.
      const bank = TITLE_BANKS[event.type];
      const r = rng.fork(`title:${chapterId}`);
      return r.pick(bank);
    }
  }
}

function beastFor(event: StoryEvent, chapterTitle: string): BeastEntry | null {
  const d = event.data;
  switch (event.type) {
    case "quiet":
      return {
        name: chapterTitle,
        kind: "quiet",
        description: `${Math.round(num(d.days))} days without a single footfall.`,
        doodleTag: "empty-shoes",
      };
    case "hill-beast":
      return {
        name: chapterTitle,
        kind: "hill",
        description: `A ${Math.round(num(d.gainM))} m climb, met ${Math.round(num(d.times))} times, and never once forgiven.`,
        doodleTag: "hills",
      };
    case "night-runs":
      return {
        name: chapterTitle,
        kind: "night",
        description: `${Math.round(num(d.count))} runs after the dark had already signed off, latest at ${str(d.latestLocalTime)}.`,
        doodleTag: "moon",
      };
    case "false-starts":
      return {
        name: chapterTitle,
        kind: "false-start",
        description: `${Math.round(num(d.count))} runs that quit before a kilometer, shortest just ${fmtKm(num(d.shortestKm))}.`,
        doodleTag: "banana",
      };
    case "ghost-elevation":
      return {
        name: chapterTitle,
        kind: "ghost",
        description: `${Math.round(num(d.elevationGainM))} m of climb the ground never actually had.`,
        doodleTag: "ghost",
      };
    default:
      return null;
  }
}

// -------------------------------------------------------------------------
// buildBook
// -------------------------------------------------------------------------

export function buildBook(year: Year, story: Story): Book {
  const seed = seedFromYear(year);
  const rng = new Rng(seed);
  const title = bookTitle(rng);

  const runsWithTracks = year.runs.filter((r) => r.track && r.track.length > 0).length;
  const totalKm = Math.round(year.runs.reduce((sum, r) => sum + r.km, 0) * 10) / 10;
  const colophon: Colophon = {
    runCount: year.runs.length,
    gpsRunCount: runsWithTracks,
    totalKm,
    places: namedPlaces(year),
    note: "made entirely in your browser; your data never left this page",
  };

  if (year.runs.length === 0) {
    return {
      seed,
      title,
      subtitle: "a very short book of running",
      dedication: ["for the year that almost ran"],
      chapters: [],
      beasts: [],
      colophon,
    };
  }

  const runById = buildRunById(year);
  const placeById = buildPlaceById(year);

  const selected = selectEvents(story.events);

  const chapters: Chapter[] = [];
  const beasts: BeastEntry[] = [];
  const usedNames = new Set<string>();

  for (const event of selected) {
    const id = `${event.type}:${event.atUtc}`;
    const chapterTitle = titleFor(event, id, rng, usedNames);
    const name = NAMED_ENTITY_TYPES.has(event.type) ? chapterTitle : undefined;
    const evidenceRun = firstEvidenceRun(event, runById);
    const place = evidenceRun?.placeId ? placeById.get(evidenceRun.placeId) : undefined;
    const placeName = place ? nearestCity(place.lat, place.lon)?.name : undefined;

    const verse = verseFor(event, { name, place: placeName }, rng);

    const chapter: Chapter = {
      id,
      kicker: KICKER[event.type],
      title: chapterTitle,
      verse,
      stats: statsFor(event, runById),
      mapSpec: computeMapSpec(event, runById),
      doodleTags: DOODLE_TAGS[event.type],
      atmosphereTags: computeAtmosphereTags(event, runById, placeById),
      eventType: event.type,
    };
    chapters.push(chapter);

    const beast = beastFor(event, chapterTitle);
    if (beast) beasts.push(beast);
  }

  const dedication =
    colophon.places.length > 0
      ? [`for the roads of ${colophon.places.join(" and ")}`, `and the ${year.runs.length} runs that drew them`]
      : [`for the roads that got you nowhere in particular`, `and the ${year.runs.length} runs that drew them`];

  const subtitle = year.runs.length < 3 ? "a very short book of running" : "a year of running, drawn in ink";

  return {
    seed,
    title,
    subtitle,
    dedication,
    chapters,
    beasts,
    colophon,
  };
}
