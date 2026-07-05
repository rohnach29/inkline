export type CoverEvent = "over" | "leave" | "drop";

const OPEN_DELAY_MS = 500;

/** Trivial pure mapping from a landing-cover drag/drop event to the CSS
 *  class that should be on the cover card: `dragover` lifts it toward the
 *  viewer, `dragleave` resets to resting (`""` — no class), `drop` swings it
 *  open. See render/shell.css for the `.lift`/`.open` transforms. */
export function coverClassFor(evt: CoverEvent): string {
  if (evt === "over") return "lift";
  if (evt === "drop") return "open";
  return "";
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface Cover3dHandle {
  /** Call on `dragover` (after `preventDefault()`). */
  onDragOver(): void;
  /** Call on `dragleave`. */
  onDragLeave(): void;
  /** Call on `drop` (after `preventDefault()`), BEFORE routing the dropped
   *  files onward. Resolves once the open animation has had time to play —
   *  500ms — so the caller can `await` it before swapping the screen away
   *  from the cover. Resolves immediately, having applied no class at all,
   *  under `prefers-reduced-motion: reduce`. */
  onDrop(): Promise<void>;
}

/** Wires the landing cover's 3D lift/open transforms onto `coverEl` (the
 *  drop-zone card itself). Pure glue over `coverClassFor` — installs
 *  nothing animated under reduced motion, matching the rest of the
 *  living-book layer's contract. */
export function wireCover3d(coverEl: Element): Cover3dHandle {
  const reduced = prefersReducedMotion();

  function applyClass(cls: string): void {
    coverEl.classList.remove("lift", "open");
    if (cls) coverEl.classList.add(cls);
  }

  return {
    onDragOver(): void {
      if (reduced) return;
      applyClass(coverClassFor("over"));
    },
    onDragLeave(): void {
      if (reduced) return;
      applyClass(coverClassFor("leave"));
    },
    onDrop(): Promise<void> {
      if (reduced) return Promise.resolve();
      applyClass(coverClassFor("drop"));
      return new Promise((resolve) => window.setTimeout(resolve, OPEN_DELAY_MS));
    },
  };
}
