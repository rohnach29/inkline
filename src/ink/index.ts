import type { Rng } from "../storytell/rng";
import { SCENES } from "./scenes/index";
import { SCENE_H, SCENE_W, type SceneParams, type SceneTag } from "./types";

export { kidStrokes } from "./kid";
export type { KidOpts, KidPose } from "./kid";
export { strokePath, resample } from "./stroke";
export { scribbleFill, hatchFill, pointInPolygon } from "./fills";
export * from "./types";

/** Full scene SVG, or "" when the tag has no registered scene yet.
 *  One <path> per stroke; centerline strokes stroke with currentColor via
 *  their class, outline strokes fill. No wobble filter — the engine wobbles. */
export function renderScene(tag: SceneTag, params: SceneParams, rng: Rng): string {
  const fn = SCENES[tag];
  if (!fn) return "";
  const strokes = [...fn(params, rng)].sort((a, b) => a.order - b.order);
  const paths = strokes
    .map(
      (s) =>
        `<path d="${s.d}" class="${s.cls}" data-order="${s.order}" data-mode="${s.mode}"/>`,
    )
    .join("");
  return `<svg class="ink-scene" viewBox="0 0 ${SCENE_W} ${SCENE_H}" data-scene="${tag}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${paths}</svg>`;
}
