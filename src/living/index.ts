import { revealChapter } from "./reveal";
import { revealFlight } from "./flight";
import { revealScene } from "./scene-reveal";
import { initAtmosphere } from "./atmosphere";
import { initBeasts } from "./beasts";
import { initShare } from "./share";
import { initToc } from "./toc";
import type { DrawHooks } from "./sound";

/** cover3d is wired directly by app/main.ts on the landing screen (before
 *  any book, and thus before `initLivingBook`, exists) — re-exported here
 *  so callers only ever need one import path into `src/living`. */
export { wireCover3d } from "./cover3d";
export type { Cover3dHandle } from "./cover3d";

/** Pencil-sound glue is also driven from app/main.ts's toolbar (the toggle
 *  button lives there, beside the theme toggle) — re-exported here for the
 *  same single-import-path reason as cover3d above. `SoundHandle` itself
 *  implements `DrawHooks`, so `main.ts` can pass its one instance straight
 *  through to `initLivingBook` below. */
export { attachSound, soundLabel } from "./sound";
export type { SoundHandle, DrawHooks } from "./sound";

/** Every section that can carry a self-drawing ink scene: chapters (route/
 *  flight map + scene), the cover (scene only), and the beasts page (one
 *  scene per beast entry, though revealScene only draws in the FIRST beast
 *  entry's <svg.ink-scene> found in a .page-beasts section — see
 *  scene-reveal.ts's single-svg-per-call contract). */
const CHAPTER_SELECTOR = ".page-chapter, .page-beasts, .page-cover";
const INTERSECTION_THRESHOLD = 0.35;

/** Callbacks run once per observed section, the first time it crosses the
 *  intersection threshold — each independently inspects the section's own
 *  markup and no-ops (returns undefined) when it finds nothing of its kind
 *  (route map, flight map, or ink scene), so all three can safely share one
 *  section without stepping on each other. */
const CHAPTER_REVEALERS: ReadonlyArray<
  (section: HTMLElement, hooks?: DrawHooks) => (() => void) | undefined
> = [revealChapter, revealFlight, revealScene];

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
 *  route maps, the flight-arc reveal, per-stroke ink-scene draw-in (chapters,
 *  cover, beasts page), and atmosphere particles. The caller gates this
 *  entirely behind `prefers-reduced-motion` — this function assumes it's
 *  safe to animate. Returns undefined when there are no sections matching
 *  `CHAPTER_SELECTOR` to wire (nothing to observe).
 *
 *  `soundHooks`, if given, is threaded through to every chapter revealer —
 *  this is the "lightweight hook registry" the pencil-scratch sound hangs
 *  off of: reveal.ts/flight.ts each fire it at the real start/end of their
 *  own draw-in, and whichever one actually has a map to draw (route vs.
 *  flight; each no-ops for the other's chapters) is the one that ends up
 *  calling it. */
function installAnimatedLayer(root: ParentNode, soundHooks?: DrawHooks): (() => void) | undefined {
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
          const cancel = reveal(section, soundHooks);
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
 *  functional chrome still needs its own teardown.
 *
 *  `soundHooks` (typically `main.ts`'s single `attachSound()` instance,
 *  which implements `DrawHooks` directly) is forwarded into the animated
 *  layer so draws can drive the pencil-scratch sound; naturally unused
 *  under reduced motion, since the animated layer never installs there and
 *  a draw that never runs can't scratch. If the hooks object also carries a
 *  `teardown` (SoundHandle does), it's invoked from this handle's teardown
 *  as defense in depth: every revealer's cancel already fires `onDrawEnd`,
 *  but the hard-kill guarantees no scratch voice can outlive the book it
 *  was scratching for, even if a future revealer forgets that contract.
 *  (The sound system itself — preference, AudioContext — survives; only an
 *  in-flight voice is cut.) */
export function initLivingBook(
  root: ParentNode,
  soundHooks?: DrawHooks & { teardown?(): void },
): LivingBookHandle {
  const functionalTeardown = installFunctionalChrome(root);
  const animatedTeardown = prefersReducedMotion() ? undefined : installAnimatedLayer(root, soundHooks);

  return {
    teardown(): void {
      functionalTeardown();
      if (animatedTeardown) animatedTeardown();
      soundHooks?.teardown?.();
    },
  };
}
