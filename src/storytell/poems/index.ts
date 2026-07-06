import type { StoryEventType } from "../../analyze/types";
import type { PoemSpec } from "./forms";

/** Corpus modules register here as Tasks 3–4 land them. */
export const CORPUS: readonly PoemSpec[] = [];

/** Kinds whose corpus is complete — the lint floors run per kind listed. */
export const COVERED_KINDS: readonly StoryEventType[] = [];

export * from "./forms";
export * from "./slots";
export * from "./select";
