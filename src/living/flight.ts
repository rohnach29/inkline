import type { DrawHooks } from "./sound";

const SVG_NS = "http://www.w3.org/2000/svg";

const FADE_MS = 300;
const STAGGER_MS = 300;
const ARC_DRAW_MS = 2500;
const DOT_RADIUS = 1.5; // 3px diameter
const DOT_FADE_MS = 300;

/** A small ink dot (3px) that travels the flight arc once, then fades. */
function createDot(): SVGCircleElement {
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("class", "ink-flight-dot no-print");
  dot.setAttribute("r", `${DOT_RADIUS}`);
  dot.setAttribute("aria-hidden", "true");
  dot.style.opacity = "0";
  return dot;
}

/** Reveals a chapter's flight map (globe + graticule rims fade in first,
 *  staggered 300ms apart; the dashed `.ink-arc` then draws in over 2500ms
 *  with a 3px ink dot traveling it once via `getPointAtLength`/rAF).
 *  No-ops (returns undefined) for chapters without a flight map — those are
 *  reveal.ts's job (route maps) or have no map at all (doodle fallback).
 *  Returns a cancel function that stops every in-flight timer/rAF and
 *  removes the traveling dot, for teardown mid-animation.
 *
 *  `hooks`, if given, fires at the real start/end of the arc draw-in itself
 *  (not the rim fade-in that precedes it, nor the dot-fade tail that
 *  follows) — see reveal.ts's matching contract for route maps. */
export function revealFlight(section: HTMLElement, hooks?: DrawHooks): (() => void) | undefined {
  const svg = section.querySelector<SVGSVGElement>(".ink-flight");
  if (!svg) return undefined;
  const maybeArc = svg.querySelector<SVGPathElement>(".ink-arc");
  if (!maybeArc) return undefined;
  // Narrowed once here; TS control-flow analysis doesn't carry a non-null
  // narrowing of an outer `const` into nested closures below (`drawArc`,
  // `frame`), so this rebinding gives every closure a provably non-null
  // reference (same pattern as atmosphere.ts's `ctx`).
  const arc: SVGPathElement = maybeArc;

  const rims = Array.from(svg.querySelectorAll<SVGGraphicsElement>(".ink-globe, .ink-graticule"));

  rims.forEach((el, i) => {
    el.style.opacity = "0";
    void el.getBoundingClientRect(); // force reflow so the transition below actually kicks
    el.style.transitionProperty = "opacity";
    el.style.transitionDuration = `${FADE_MS}ms`;
    el.style.transitionDelay = `${i * STAGGER_MS}ms`;
    el.style.opacity = "1";
  });
  const rimsDoneMs = rims.length > 0 ? (rims.length - 1) * STAGGER_MS + FADE_MS : 0;

  const total = arc.getTotalLength();
  arc.style.strokeDasharray = `${total}`;
  arc.style.strokeDashoffset = `${total}`;

  const dot = createDot();
  const startPt = arc.getPointAtLength(0);
  dot.setAttribute("cx", `${startPt.x}`);
  dot.setAttribute("cy", `${startPt.y}`);
  svg.appendChild(dot);

  let rafId = 0;
  let fadeTimer = 0;

  function drawArc(): void {
    void arc.getBoundingClientRect(); // force reflow before the transition starts
    arc.style.transitionProperty = "stroke-dashoffset";
    arc.style.transitionDuration = `${ARC_DRAW_MS}ms`;
    arc.style.transitionTimingFunction = "linear";
    arc.classList.add("is-drawing");
    arc.style.strokeDashoffset = "0";
    dot.style.opacity = "1";
    hooks?.onDrawStart(ARC_DRAW_MS);

    const start = performance.now();

    function frame(now: number): void {
      const t = Math.min(1, (now - start) / ARC_DRAW_MS);
      const pt = arc.getPointAtLength(t * total);
      dot.setAttribute("cx", `${pt.x}`);
      dot.setAttribute("cy", `${pt.y}`);

      if (t < 1) {
        rafId = requestAnimationFrame(frame);
      } else {
        hooks?.onDrawEnd();
        dot.classList.add("is-fading");
        fadeTimer = window.setTimeout(() => dot.remove(), DOT_FADE_MS);
      }
    }
    rafId = requestAnimationFrame(frame);
  }

  const startTimer = window.setTimeout(drawArc, rimsDoneMs);

  return () => {
    window.clearTimeout(startTimer);
    window.clearTimeout(fadeTimer);
    cancelAnimationFrame(rafId);
    dot.remove();
    hooks?.onDrawEnd();
  };
}
