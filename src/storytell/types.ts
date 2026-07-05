import type { StoryEventType } from "../analyze/types";

/** Everything Plan C renders. Deterministic, serializable, no functions. */
export interface Book {
  seed: number;
  title: string;
  subtitle: string; // fixed: "a year of running, drawn in ink" (or the short-year variant)
  dedication: string[]; // 2-3 lines, references real places/counts
  chapters: Chapter[]; // chronological by event atUtc
  beasts: BeastEntry[];
  colophon: Colophon;
}

export interface Chapter {
  id: string; // `${event.type}:${event.atUtc}`
  kicker: string; // e.g. "in which the year begins"
  title: string;
  verse: string[];
  stats: ChapterStat[]; // honest numbers, already formatted
  mapSpec: MapSpec | null;
  doodleTags: string[];
  atmosphereTags: string[];
  eventType: StoryEventType;
}

export type MapSpec =
  | { kind: "route"; runId: string }
  | { kind: "flight"; from: LatLonName; to: LatLonName; km: number };

export interface LatLonName {
  lat: number;
  lon: number;
  name: string;
}

export interface ChapterStat {
  label: string;
  value: string;
}

export interface BeastEntry {
  name: string;
  kind: "quiet" | "hill" | "night" | "false-start" | "ghost";
  description: string;
  doodleTag: string;
}

export interface Colophon {
  runCount: number;
  gpsRunCount: number;
  totalKm: number;
  places: string[];
  note: string;
}
