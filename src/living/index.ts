import { revealChapter } from "./reveal";
import { revealFlight } from "./flight";
import { initAtmosphere } from "./atmosphere";
import { initBeasts } from "./beasts";
import { initShare } from "./share";
import { initToc } from "./toc";

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
  /** Disconnects every observer, cancels any in-flight draw/runner
   *  animation, removes any runners still in the DOM, and removes the
   *  share buttons + TOC ribbon. Safe to call more than once. */
  teardown(): void;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Installs the purely-functional chrome — the "keep this page" share
 *  buttons and the table-of-contents ribbon — that must behave identically
 *  regardless of `prefers-reduced-motion`. Neither animates anything (the
 *  TOC's scroll-spy IntersectionObserver just toggles a highlight class;
 *  its scroll itself is instant under reduced motion, smooth otherwise —
 *  both handled internally by toc.ts), so unlike the animated layer below,
 *  this is never gated on the reduced-motion check. */
function installFunctionalChrome(root: ParentNode): () => void {
  const shareTeardown = initShare(root);
  const tocTeardown = initToc(root);
  return (): void => {
    shareTeardown();
    tocTeardown();
  };
}

/** Installs the animated living-book layer: self-drawing ink + runner over
 *  route maps, the flight-arc reveal, atmosphere particles, and hover/tap
 *  beast doodles. The caller gates this entirely behind
 *  `prefers-reduced-motion` — this function assumes it's safe to animate.
 *  Returns undefined when there are no `.page-chapter` sections to wire
 *  (nothing to observe). */
function installAnimatedLayer(root: ParentNode): (() => void) | undefined {
  const sections = root.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR);
  if (sections.length === 0) return undefined;

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

  return (): void => {
    observer.disconnect();
    for (const cancel of cancels) cancel();
    cancels.clear();
    if (atmosphereTeardown) atmosphereTeardown();
    beastsTeardown();
  };
}

/** Wires the entire living-book layer over every `.page`/`.page-chapter`
 *  section found under `root`.
 *
 *  Two independent halves, split precisely along the
 *  `prefers-reduced-motion` line:
 *  - Functional chrome (share-a-page PNG, TOC ribbon) installs
 *    unconditionally — neither animates, both are useful (arguably more
 *    useful) to a reduced-motion visitor.
 *  - The animated layer (self-drawing ink/runner, flight arcs, atmosphere
 *    particles, beast doodles) installs only when the visitor does NOT
 *    prefer reduced motion; under reduced motion this half installs
 *    NOTHING (no observers that animate, no particles, no runner, no cover
 *    transform, no sound), per the plan's global constraint.
 *
 *  Always returns a real handle — even under reduced motion, since the
 *  functional chrome still needs its own teardown. */
export function initLivingBook(root: ParentNode): LivingBookHandle {
  const functionalTeardown = installFunctionalChrome(root);
  const animatedTeardown = prefersReducedMotion() ? undefined : installAnimatedLayer(root);

  return {
    teardown(): void {
      functionalTeardown();
      if (animatedTeardown) animatedTeardown();
    },
  };
}
