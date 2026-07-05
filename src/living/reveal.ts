import { drawDurationMs, RUNNER_FADE_MS } from "./timing";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Hand-authored 5-stroke stick figure (circle head + 4 lines), stroke-only,
 *  ~14px, drawn facing +X ("running right") in a local coordinate space
 *  centered on the origin — the caller translates/rotates the whole group
 *  onto the path each frame. Runs through the same wobble filter as every
 *  other ink stroke in the book (defs are emitted once, globally, by
 *  render/pages.ts) so it reads as part of the same hand-drawn aesthetic. */
function createRunner(): SVGGElement {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("class", "ink-runner no-print");
  g.setAttribute("filter", "url(#wobble)");
  g.setAttribute("aria-hidden", "true");

  const strokes: [string, Record<string, string>][] = [
    ["circle", { cx: "5", cy: "-4", r: "1.8" }],
    ["line", { x1: "5", y1: "-2.2", x2: "2", y2: "3" }], // torso
    ["line", { x1: "2", y1: "3", x2: "-3", y2: "6" }], // back leg
    ["line", { x1: "2", y1: "3", x2: "5", y2: "7" }], // front leg
    ["line", { x1: "3", y1: "0", x2: "6", y2: "-1" }], // arm
  ];

  for (const [tag, attrs] of strokes) {
    const el = document.createElementNS(SVG_NS, tag);
    el.setAttribute("class", "ink-runner-stroke");
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    g.appendChild(el);
  }

  return g;
}

/** Reads a duration in ms off `data-draw-ms`, falling back to the same
 *  default `drawDurationMs` uses for missing pace data if the attribute is
 *  absent or unparsable — the map area should always carry a valid one
 *  (render/pages.ts guarantees it for every route/flight svg), but a
 *  malformed attribute must never hang or throw. */
function readDrawMs(svg: SVGSVGElement): number {
  const attr = svg.getAttribute("data-draw-ms");
  const parsed = attr ? Number.parseInt(attr, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : drawDurationMs(null);
}

/** Draws a chapter's route path in over its `data-draw-ms` duration, with a
 *  tiny runner tracing the path via requestAnimationFrame. Route maps ONLY
 *  — flight maps (`.ink-flight`/`.ink-arc`) get their own dedicated reveal
 *  (globe/graticule fade-in, fixed-duration arc draw, traveling dot; a
 *  stick-figure runner tracing a flight arc doesn't read as intended) via
 *  `flight.ts`'s `revealFlight`, registered alongside this one in
 *  `index.ts`'s per-chapter callback registry. No-ops (returns undefined)
 *  when the section has no route path to animate — a flight chapter, or the
 *  doodle-fallback map area, neither of which carry `.ink-map`/`.ink-route`.
 *  Returns a cancel function that stops the rAF loop, clears the fade
 *  timer, and removes the runner immediately — used for teardown when the
 *  living-book layer is torn down mid-draw. */
export function revealChapter(section: HTMLElement): (() => void) | undefined {
  const svg = section.querySelector<SVGSVGElement>(".ink-map");
  if (!svg) return undefined;
  const path = svg.querySelector<SVGPathElement>(".ink-route");
  if (!path) return undefined;

  const ms = readDrawMs(svg);
  const total = path.getTotalLength();

  path.style.strokeDasharray = `${total}`;
  path.style.strokeDashoffset = `${total}`;
  void path.getBoundingClientRect(); // force reflow before the transition starts
  path.style.transitionDuration = `${ms}ms`;
  path.classList.add("is-drawing");
  path.style.strokeDashoffset = "0"; // kick the transition (dasharray total -> 0)

  const runner = createRunner();
  svg.appendChild(runner);

  const start = performance.now();
  let rafId = 0;
  let fadeTimer = 0;

  function frame(now: number): void {
    const t = Math.min(1, (now - start) / ms);
    const len = t * total;
    const pt = path!.getPointAtLength(len);
    const ahead = path!.getPointAtLength(Math.min(total, len + 1));
    const angle = (Math.atan2(ahead.y - pt.y, ahead.x - pt.x) * 180) / Math.PI;
    runner.setAttribute("transform", `translate(${pt.x} ${pt.y}) rotate(${angle})`);

    if (t < 1) {
      rafId = requestAnimationFrame(frame);
    } else {
      runner.classList.add("is-fading");
      fadeTimer = window.setTimeout(() => runner.remove(), RUNNER_FADE_MS);
    }
  }
  rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    window.clearTimeout(fadeTimer);
    runner.remove();
  };
}
