const ALIVE_MS = 1400;
const BEAST_SELECTOR = ".page-beasts .ink-doodle, .doodle-strip .ink-doodle";

/** Pure-ish trigger logic for a single beast doodle: given the element and
 *  a monotonic clock (`performance.now`-shaped, injected so tests can drive
 *  it with a fake one), returns a function that, on `"enter"`, adds the
 *  `is-alive` class and returns `true` — UNLESS the doodle is still inside
 *  its previous 1400ms window, in which case it does nothing and returns
 *  `false`. Re-triggerable once that window has fully elapsed. Class
 *  removal (so a later trigger can restart the CSS animation) is the
 *  caller's job — this function only decides eligibility; it never touches
 *  timers, so it stays trivially fake-clock-testable. */
export function wireBeast(el: Element, now: () => number): (type: "enter") => boolean {
  let aliveUntil = -Infinity;
  return (): boolean => {
    const t = now();
    if (t < aliveUntil) return false;
    aliveUntil = t + ALIVE_MS;
    el.classList.add("is-alive");
    return true;
  };
}

/** Wires every `.ink-doodle` inside `.page-beasts` and `.doodle-strip` under
 *  `root`: hovering (`mouseenter`) or tapping (`click`) triggers a 1400ms
 *  `is-alive` wiggle (ghosts additionally drift, via the CSS selector
 *  `.ink-doodle[data-tag="ghost"].is-alive` — see render/theme.css), gated
 *  by `wireBeast` so a doodle mid-animation ignores further triggers until
 *  it ends. Returns a teardown that removes listeners and clears any
 *  in-flight class-removal timers. */
export function initBeasts(root: ParentNode): () => void {
  const elements = Array.from(root.querySelectorAll<Element>(BEAST_SELECTOR));
  if (elements.length === 0) return () => {};

  const timers = new Set<number>();
  const cleanups: Array<() => void> = [];

  for (const el of elements) {
    const trigger = wireBeast(el, () => performance.now());

    const fire = (): void => {
      if (!trigger("enter")) return;
      const timer = window.setTimeout(() => {
        el.classList.remove("is-alive");
        timers.delete(timer);
      }, ALIVE_MS);
      timers.add(timer);
    };

    el.addEventListener("mouseenter", fire);
    el.addEventListener("click", fire);
    cleanups.push(() => {
      el.removeEventListener("mouseenter", fire);
      el.removeEventListener("click", fire);
    });
  }

  return (): void => {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    for (const cleanup of cleanups) cleanup();
  };
}
