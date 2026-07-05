import type { Year } from "../ingest";
import type { Story, StoryEvent } from "./types";
import {
  detectFirstLast,
  detectRecords,
  detectNightRuns,
  detectQuiets,
  detectStreaks,
  detectFalseStarts,
  detectMonths,
} from "./patterns";
import { detectRouteChampion, detectHillBeast, detectGhosts, detectJourneys } from "./geo";

function compareEvents(a: StoryEvent, b: StoryEvent): number {
  if (a.atUtc !== b.atUtc) return a.atUtc - b.atUtc;
  if (a.type < b.type) return -1;
  if (a.type > b.type) return 1;
  return 0;
}

/** Runs every B2 + B3 detector and returns a single, deterministically
 * ordered Story. Never throws: every detector already returns [] on an
 * empty/degenerate Year, so concatenation + sort is safe unconditionally. */
export function analyzeYear(year: Year): Story {
  const events: StoryEvent[] = [
    ...detectFirstLast(year),
    ...detectRecords(year),
    ...detectNightRuns(year),
    ...detectQuiets(year),
    ...detectStreaks(year),
    ...detectFalseStarts(year),
    ...detectMonths(year),
    ...detectRouteChampion(year),
    ...detectHillBeast(year),
    ...detectGhosts(year),
    ...detectJourneys(year),
  ];
  events.sort(compareEvents);
  return { events };
}

export * from "./types";
