/** Per-stroke draw-in for ink scenes: centerline strokes draw via
 *  stroke-dash animation, outline strokes fade in, both staggered in
 *  data-order sequence. Runs once per section on first reveal; the
 *  animated layer only installs when reduced motion is off.
 *
 *  A section can carry more than one `svg.ink-scene` (the beasts page has
 *  one per `.beast-entry`, not just one per section like chapters/cover),
 *  so every not-yet-revealed scene in the section is drawn in together:
 *  each svg's own paths are sorted by its own `data-order` sequence, then
 *  every svg's path list is concatenated (in DOM order) into one combined
 *  list that the stagger timing runs across — svgs don't get their own
 *  independent stagger windows, but each keeps its own path ordering. */
const TOTAL_MS = 2400;
const PER_STROKE_MS = 420;

export function revealScene(section: HTMLElement): (() => void) | undefined {
  const svgs = Array.from(section.querySelectorAll<SVGSVGElement>("svg.ink-scene")).filter(
    (svg) => svg.dataset.revealed !== "1",
  );
  if (svgs.length === 0) return undefined;

  const paths: SVGPathElement[] = [];
  for (const svg of svgs) {
    svg.dataset.revealed = "1";
    const svgPaths = Array.from(svg.querySelectorAll<SVGPathElement>("path")).sort(
      (a, b) => Number(a.dataset.order ?? 0) - Number(b.dataset.order ?? 0),
    );
    paths.push(...svgPaths);
  }
  if (paths.length === 0) return undefined;

  const stagger = Math.max(24, (TOTAL_MS - PER_STROKE_MS) / paths.length);
  const timers: number[] = [];
  for (const [i, p] of paths.entries()) {
    if (p.dataset.mode === "centerline") {
      const len = p.getTotalLength();
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      p.style.transition = `stroke-dashoffset ${PER_STROKE_MS}ms ease-out`;
    } else {
      p.style.opacity = "0";
      p.style.transition = `opacity ${Math.round(PER_STROKE_MS * 0.6)}ms ease-out`;
    }
    timers.push(
      window.setTimeout(() => {
        p.style.strokeDashoffset = "0";
        p.style.opacity = "1";
      }, Math.round(i * stagger)),
    );
  }
  return () => {
    for (const t of timers) window.clearTimeout(t);
    for (const p of paths) {
      p.style.strokeDasharray = "";
      p.style.strokeDashoffset = "";
      p.style.opacity = "";
      p.style.transition = "";
    }
  };
}
