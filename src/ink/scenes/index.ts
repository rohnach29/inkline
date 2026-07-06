import type { SceneFn, SceneTag } from "../types";
import { scene as firstRun } from "./first-run";
import { scene as lastRun } from "./last-run";
import { scene as longestRun } from "./longest-run";
import { scene as fastestRun } from "./fastest-run";
import { scene as hilliestRun } from "./hilliest-run";
import { scene as earliestRun } from "./earliest-run";
import { scene as latestRun } from "./latest-run";
import { scene as nightRuns } from "./night-runs";
import { scene as falseStarts } from "./false-starts";
import { scene as quiet } from "./quiet";
import { scene as streak } from "./streak";
import { scene as journey } from "./journey";
import { scene as month } from "./month";
import { scene as routeChampion } from "./route-champion";
import { scene as hillBeast } from "./hill-beast";
import { scene as ghostElevation } from "./ghost-elevation";

/** Scene modules register here as Tasks 4–6 land them. */
export const SCENES: Partial<Record<SceneTag, SceneFn>> = {
  "first-run": firstRun,
  "last-run": lastRun,
  "longest-run": longestRun,
  "fastest-run": fastestRun,
  "hilliest-run": hilliestRun,
  "earliest-run": earliestRun,
  "latest-run": latestRun,
  "night-runs": nightRuns,
  "false-starts": falseStarts,
  "quiet": quiet,
  "streak": streak,
  "journey": journey,
  "month": month,
  "route-champion": routeChampion,
  "hill-beast": hillBeast,
  "ghost-elevation": ghostElevation,
};
