import type { StoryEventType } from "../../analyze/types";

export const POEM_FORMS = [
  "quatrain", "quip", "list", "dialogue", "letter",
  "notice", "spell", "concrete", "narrative",
] as const;
export type PoemForm = (typeof POEM_FORMS)[number];

/** Carried over from the retired couplet engine — same union, new home. */
export type Mood = "triumphant" | "sheepish" | "nocturnal" | "quiet" | "absurd" | "steady";

export interface PoemLine {
  /** may contain {slot} tokens in a PoemSpec; empty string = stanza gap */
  text: string;
  voice?: 1 | 2;                        // dialogue only
  indent?: 0 | 1 | 2 | 3;               // hanging/stepped indentation
  align?: "left" | "center" | "right";  // default left
  size?: "small" | "normal" | "large";  // concrete only; default normal
}

export interface ChapterPoem {
  form: PoemForm;
  lines: PoemLine[];
}

export type SlotName =
  | "km" | "days" | "count" | "month" | "pace"
  | "time" | "gain" | "name" | "place" | "year";

export type Band = "small" | "medium" | "large";

export interface PoemSpec {
  /** `${kind}/${slug}`, unique corpus-wide */
  id: string;
  kind: StoryEventType;
  form: PoemForm;
  band: Band | "any";
  mood: Mood;
  /** exactly the slots the lines reference — no more, no less */
  slots: readonly SlotName[];
  lines: PoemLine[];
}

/** Bounds on NON-EMPTY line count per form. */
export const FORM_RULES: Record<PoemForm, { min: number; max: number }> = {
  quatrain: { min: 4, max: 12 },
  quip: { min: 2, max: 4 },
  list: { min: 5, max: 12 },
  dialogue: { min: 6, max: 14 },
  letter: { min: 6, max: 14 },
  notice: { min: 4, max: 10 },
  spell: { min: 5, max: 12 },
  concrete: { min: 5, max: 16 },
  narrative: { min: 12, max: 20 },
};

/** Slots guaranteed resolvable for each event type (from analyze data shapes
 *  + book.ts naming: `name` is set exactly for NAMED_ENTITY_TYPES). A poem
 *  whose slots ⊆ SAFE_SLOTS[kind] can never be filtered out by honesty. */
export const SAFE_SLOTS: Record<StoryEventType, readonly SlotName[]> = {
  "first-run": ["km", "year"],
  "last-run": ["km", "year"],
  "longest-run": ["km", "year"],
  "fastest-run": ["pace", "km", "year"],
  "hilliest-run": ["gain", "year"],
  "earliest-run": ["time", "year"],
  "latest-run": ["time", "year"],
  "night-runs": ["count", "time", "name"],
  "false-starts": ["count"],
  quiet: ["days", "year", "name"],
  streak: ["days", "year"],
  journey: ["km"],
  month: ["month", "km", "year"],
  "route-champion": ["count", "km", "name"],
  "hill-beast": ["gain", "name"],
  "ghost-elevation": ["gain", "name"],
};

/** Longest plausible fill per slot — the lint suite renders every line with
 *  these and enforces the 60-char layout bound. */
export const WORST_CASE: Record<SlotName, string> = {
  km: "999.9",
  days: "365",
  count: "99",
  month: "September",
  pace: "12:59 /km",
  time: "23:59",
  gain: "9999",
  name: "The Everlasting Quiet Returns",
  place: "West Lafayette",
  year: "2026",
};
