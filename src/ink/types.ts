import type { StoryEventType } from "../analyze/types";
import type { Rng } from "../storytell/rng";

export interface Pt {
  x: number;
  y: number;
}

/** One pen stroke of a scene, in draw order. `centerline` strokes render as
 *  stroked paths (and draw in via dash animation); `outline` strokes are
 *  closed variable-width shapes rendered as fills (and fade in). */
export interface OrderedStroke {
  d: string;
  mode: "centerline" | "outline";
  cls: "s-ink" | "s-faint" | "s-pencil";
  order: number;
}

export const SCENE_W = 240;
export const SCENE_H = 200;

export type SceneTag =
  | StoryEventType
  | "beast-quiet"
  | "beast-hill"
  | "beast-night"
  | "beast-false-start"
  | "beast-ghost"
  | "cover";

/** Data-driven knobs a scene may read (all optional; scenes clamp). */
export interface SceneParams {
  km?: number;
  days?: number;
  count?: number;
  gainM?: number;
  paceMinPerKm?: number;
}

export type SceneFn = (params: SceneParams, rng: Rng) => OrderedStroke[];
