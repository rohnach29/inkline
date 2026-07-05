/** Pure timing constants/helpers for the living-book layer. The actual
 *  pace -> duration mapping lives in `src/render/svg.ts` (render must stay
 *  the single source of truth so the data-draw-ms attribute it emits and the
 *  duration this layer falls back to when reading a malformed/missing
 *  attribute always agree) — re-exported here so `src/living/**` never has
 *  to import across the render/living boundary ad hoc. */
export { drawDurationMs } from "../render/svg";

/** How long a runner keeps fading before it's removed from the DOM once its
 *  chapter's map has finished drawing in. */
export const RUNNER_FADE_MS = 300;
