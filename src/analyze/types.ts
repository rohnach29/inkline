export type StoryEventType =
  | "first-run"
  | "last-run"
  | "longest-run"
  | "fastest-run"
  | "hilliest-run"
  | "earliest-run"
  | "latest-run"
  | "night-runs"
  | "false-starts"
  | "quiet"
  | "streak"
  | "journey"
  | "month"
  | "route-champion"
  | "hill-beast"
  | "ghost-elevation";

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

export interface Story {
  events: StoryEvent[];
}
