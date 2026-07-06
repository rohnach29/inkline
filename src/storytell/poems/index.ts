import type { StoryEventType } from "../../analyze/types";
import type { PoemSpec } from "./forms";

import { POEMS as FIRST_RUN } from "./first-run";
import { POEMS as LAST_RUN } from "./last-run";
import { POEMS as LONGEST_RUN } from "./longest-run";
import { POEMS as FASTEST_RUN } from "./fastest-run";
import { POEMS as HILLIEST_RUN } from "./hilliest-run";
import { POEMS as EARLIEST_RUN } from "./earliest-run";
import { POEMS as LATEST_RUN } from "./latest-run";
import { POEMS as NIGHT_RUNS } from "./night-runs";
import { POEMS as FALSE_STARTS } from "./false-starts";
import { POEMS as QUIET } from "./quiet";
import { POEMS as STREAK } from "./streak";
import { POEMS as JOURNEY } from "./journey";
import { POEMS as MONTH } from "./month";
import { POEMS as ROUTE_CHAMPION } from "./route-champion";
import { POEMS as HILL_BEAST } from "./hill-beast";
import { POEMS as GHOST_ELEVATION } from "./ghost-elevation";

/** Corpus modules register here as Tasks 3–4 land them. */
export const CORPUS: readonly PoemSpec[] = [
  ...FIRST_RUN, ...LAST_RUN, ...LONGEST_RUN, ...FASTEST_RUN,
  ...HILLIEST_RUN, ...EARLIEST_RUN, ...LATEST_RUN, ...NIGHT_RUNS,
  ...FALSE_STARTS, ...QUIET, ...STREAK, ...JOURNEY,
  ...MONTH, ...ROUTE_CHAMPION, ...HILL_BEAST, ...GHOST_ELEVATION,
];

/** Kinds whose corpus is complete — the lint floors run per kind listed. */
export const COVERED_KINDS: readonly StoryEventType[] = [
  "first-run", "last-run", "longest-run", "fastest-run",
  "hilliest-run", "earliest-run", "latest-run", "night-runs",
  "false-starts", "quiet", "streak", "journey",
  "month", "route-champion", "hill-beast", "ghost-elevation",
];

export * from "./forms";
export * from "./slots";
export * from "./select";
export * from "./features";
export * from "./realize";
