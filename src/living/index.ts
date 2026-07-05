import { revealChapter } from "./reveal";
import { initAtmosphere } from "./atmosphere";

const CHAPTER_SELECTOR = ".page-chapter";
const INTERSECTION_THRESHOLD = 0.35;

export interface LivingBookHandle {
  /** Disconnects the observer, cancels any in-flight draw/runner animation,
   *  and removes any runners still in the DOM. Safe to call more than once. */
  teardown(): void;
}

const NOOP_HANDLE: LivingBookHandle = {
  teardown(): void {
    /* nothing was installed */
  },
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Wires the self-drawing-ink layer over every `.page-chapter` section found
 *  under `root`: an IntersectionObserver (threshold 0.35) watches them all,
 *  and the first time a chapter crosses that threshold its route/flight map
 *  draws itself in, led by a tiny runner, over that map's `data-draw-ms`
 *  duration. A chapter that re-enters the viewport never redraws — a
 *  WeakSet of already-drawn sections gates it to a one-shot per section.
 *
 *  Honors `prefers-reduced-motion: reduce`: when set, this installs NOTHING
 *  (no observer, no animation) and returns a no-op teardown immediately. */
export function initLivingBook(root: ParentNode): LivingBookHandle {
  if (prefersReducedMotion()) return NOOP_HANDLE;

  const sections = root.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR);
  if (sections.length === 0) return NOOP_HANDLE;

  const done = new WeakSet<Element>();
  const cancels = new Set<() => void>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const section = entry.target as HTMLElement;
        if (done.has(section)) continue;
        done.add(section);

        const cancel = revealChapter(section);
        if (cancel) cancels.add(cancel);
      }
    },
    { threshold: INTERSECTION_THRESHOLD },
  );

  sections.forEach((section) => observer.observe(section));

  const atmosphereTeardown = initAtmosphere(root);

  return {
    teardown(): void {
      observer.disconnect();
      for (const cancel of cancels) cancel();
      cancels.clear();
      if (atmosphereTeardown) atmosphereTeardown();
    },
  };
}
