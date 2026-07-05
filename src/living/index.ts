import { revealChapter } from "./reveal";
import { revealFlight } from "./flight";
import { initAtmosphere } from "./atmosphere";
import { initBeasts } from "./beasts";

/** cover3d is wired directly by app/main.ts on the landing screen (before
 *  any book, and thus before `initLivingBook`, exists) — re-exported here
 *  so callers only ever need one import path into `src/living`. */
export { wireCover3d } from "./cover3d";
export type { Cover3dHandle } from "./cover3d";

const CHAPTER_SELECTOR = ".page-chapter";
const INTERSECTION_THRESHOLD = 0.35;

/** Callbacks run once per chapter section, the first time it crosses the
 *  intersection threshold — each independently inspects the section's own
 *  map markup and no-ops (returns undefined) when it finds nothing of its
 *  kind (route vs. flight), so both can safely share one chapter without
 *  stepping on each other. */
const CHAPTER_REVEALERS: ReadonlyArray<(section: HTMLElement) => (() => void) | undefined> = [
  revealChapter,
  revealFlight,
];

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
 *  and the first time a chapter crosses that threshold every registered
 *  revealer (route maps via reveal.ts, flight maps via flight.ts) gets a
 *  shot at it. A chapter that re-enters the viewport never redraws — a
 *  WeakSet of already-drawn sections gates it to a one-shot per section.
 *  Also wires atmosphere particles and the hover/tap beast doodles.
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

        for (const reveal of CHAPTER_REVEALERS) {
          const cancel = reveal(section);
          if (cancel) cancels.add(cancel);
        }
      }
    },
    { threshold: INTERSECTION_THRESHOLD },
  );

  sections.forEach((section) => observer.observe(section));

  const atmosphereTeardown = initAtmosphere(root);
  const beastsTeardown = initBeasts(root);

  return {
    teardown(): void {
      observer.disconnect();
      for (const cancel of cancels) cancel();
      cancels.clear();
      if (atmosphereTeardown) atmosphereTeardown();
      beastsTeardown();
    },
  };
}
