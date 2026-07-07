import type { StoryEventType } from "../../analyze/types";
import type { HourBand, Season, Weekday } from "./features";

export const POEM_FORMS = ["verse", "list", "concrete"] as const;
export type PoemForm = (typeof POEM_FORMS)[number];

/** Carried over from the retired couplet engine — same union, new home. */
export type Mood = "triumphant" | "sheepish" | "nocturnal" | "quiet" | "absurd" | "steady";

export interface PoemLine {
  /** may contain {slot} tokens in a PoemSpec; empty string = stanza gap */
  text: string;
  indent?: 0 | 1 | 2 | 3;               // hanging/stepped indentation
  align?: "left" | "center" | "right";  // default left
  size?: "small" | "normal" | "large";  // concrete only; default normal
}

export interface ChapterPoem {
  /** the picked PoemSpec's id — render ignores it, tests key on it */
  id: string;
  form: PoemForm;
  lines: PoemLine[];
  /** callback couplet, present only when its cast member arrived earlier */
  coda?: PoemLine[];
}

/** A branch condition: every listed key must match the computed feature.
 *  A missing feature never matches, so the branch falls to its default. */
export interface FeatureCond {
  hourBand?: readonly HourBand[];
  weekday?: readonly Weekday[];
  season?: readonly Season[];
  band?: readonly Band[];
}

export interface PoemVariant {
  when: FeatureCond;
  /** an authored couplet/quatrain written FOR this poem, not a slot fill */
  lines: readonly PoemLine[];
}

/** A planned branch point inside a poem; first matching variant wins,
 *  otherwise the (required) default lines. */
export interface PoemBranch {
  branch: {
    variants: readonly PoemVariant[];
    default: readonly PoemLine[];
  };
}

export type PoemUnit = PoemLine | PoemBranch;

/** The recurring cast a book can assemble; poems introduce members and
 *  later chapters may call back to them via codas. */
export const CAST_IDS = [
  "shadow", "shoes", "the-hill", "the-dog", "the-moon",
  "the-mailbox", "the-watch", "the-quiet",
] as const;
export type CastId = (typeof CAST_IDS)[number];

export type SlotName =
  | "km" | "days" | "count" | "month" | "pace"
  | "gain" | "name" | "place" | "year"
  | "clock" | "weekday" | "times";

export type Band = "small" | "medium" | "large";

export interface PoemSpec {
  /** `${kind}/${slug}`, unique corpus-wide */
  id: string;
  kind: StoryEventType;
  form: PoemForm;
  band: Band | "any";
  mood: Mood;
  /** union of slots referenced across base lines, variants, defaults, coda */
  slots: readonly SlotName[];
  lines: readonly PoemUnit[];
  /** cast members this poem brings on stage */
  introduces?: readonly CastId[];
  /** callback couplet, appended only if `requires` arrived in an earlier chapter */
  coda?: { requires: CastId; lines: readonly PoemLine[] };
}

/** Bounds on NON-EMPTY line count per form. */
export const FORM_RULES: Record<PoemForm, { min: number; max: number }> = {
  verse: { min: 4, max: 16 },
  list: { min: 5, max: 12 },
  concrete: { min: 5, max: 16 },
};

/** Slots guaranteed resolvable for each event type (from analyze data shapes
 *  + book.ts naming: `name` is set exactly for NAMED_ENTITY_TYPES). A poem
 *  whose slots ⊆ SAFE_SLOTS[kind] can never be filtered out by honesty. */
export const SAFE_SLOTS: Record<StoryEventType, readonly SlotName[]> = {
  "first-run": ["km", "year", "clock", "weekday"],
  "last-run": ["km", "year", "clock", "weekday"],
  "longest-run": ["km", "year", "clock", "weekday"],
  "fastest-run": ["pace", "km", "year", "clock", "weekday"],
  "hilliest-run": ["gain", "year", "clock", "weekday"],
  "earliest-run": ["year", "clock", "weekday"],
  "latest-run": ["year", "clock", "weekday"],
  "night-runs": ["count", "name", "clock", "weekday"],
  "false-starts": ["count", "clock", "weekday"],
  quiet: ["days", "year", "name", "clock", "weekday"],
  streak: ["days", "year", "weekday"],
  journey: ["km"],
  month: ["month", "km", "year"],
  "route-champion": ["count", "km", "name"],
  "hill-beast": ["gain", "name", "times"],
  "ghost-elevation": ["gain", "name", "clock", "weekday"],
};

/** Longest plausible fill per slot — the lint suite renders every line with
 *  these and enforces the 60-char layout bound. */
export const WORST_CASE: Record<SlotName, string> = {
  km: "99999.9",
  days: "365",
  count: "99",
  month: "September",
  pace: "12:59 /km",
  gain: "9999",
  name: "The Hill That Lied About Its Size (Again)",
  place: "West Lafayette",
  year: "2026",
  clock: "12:59",
  weekday: "Wednesday",
  times: "99",
};
