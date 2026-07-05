const CHAPTER_SELECTOR = ".page-chapter";
const SPY_THRESHOLD = 0.5;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Pulls a chapter's TOC label straight off its own rendered DOM (kicker +
 *  title text) via `textContent` — never `innerHTML` — so there is no
 *  injection surface even though this reads data ultimately derived from
 *  the user's own export (already `esc()`-escaped once by render/pages.ts;
 *  reading it back out as text and re-inserting it as text, below, never
 *  re-interprets it as markup). */
function chapterLabel(section: HTMLElement): string {
  const kicker = section.querySelector(".kicker")?.textContent?.trim() ?? "";
  const title = section.querySelector(".chapter-title")?.textContent?.trim() ?? "";
  return [kicker, title].filter((part) => part.length > 0).join(" — ");
}

/** Installs the fixed left-edge table-of-contents ribbon (`.toc-ribbon
 *  no-print`, collapsed to a 10px ink spine by CSS, expanding on
 *  hover/focus-within) over every `.page-chapter` under `root`. Purely
 *  functional chrome, not decoration — it must work identically under
 *  `prefers-reduced-motion`, so it runs its own lightweight
 *  IntersectionObserver for scroll-spy highlighting (no CSS animation, no
 *  dependency on the D1 chapter-reveal observer, which installs nothing at
 *  all under reduced motion) and picks `scrollIntoView`'s `behavior`
 *  per-click based on the same media query. Every entry is a real
 *  `<button>` (keyboard accessible, focusable, `esc`-safe via `textContent`
 *  only). Returns a teardown that disconnects the observer, removes every
 *  listener, and removes the ribbon from the DOM. */
export function initToc(root: ParentNode): () => void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR));
  if (sections.length === 0) return () => {};

  const nav = document.createElement("nav");
  nav.className = "toc-ribbon no-print";
  nav.setAttribute("aria-label", "table of contents");

  const spine = document.createElement("div");
  spine.className = "toc-spine";
  spine.setAttribute("aria-hidden", "true");
  nav.appendChild(spine);

  const list = document.createElement("ul");
  list.className = "toc-list";
  nav.appendChild(list);

  const cleanups: Array<() => void> = [];
  const buttons = new Map<HTMLElement, HTMLButtonElement>();

  for (const section of sections) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toc-entry";
    btn.textContent = chapterLabel(section); // textContent only — never innerHTML

    const onClick = (): void => {
      section.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };
    btn.addEventListener("click", onClick);
    cleanups.push(() => btn.removeEventListener("click", onClick));

    li.appendChild(btn);
    list.appendChild(li);
    buttons.set(section, btn);
  }

  document.body.appendChild(nav);

  const observer = new IntersectionObserver(
    (entries) => {
      // A single callback batch can report several chapters intersecting at
      // once (fast scroll, initial observe). Highlight the TOPMOST one —
      // smallest boundingClientRect.top among the intersecting entries —
      // not whichever happened to come last in the batch, which is
      // delivery-order luck, not reading order.
      let topmost: IntersectionObserverEntry | undefined;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!topmost || entry.boundingClientRect.top < topmost.boundingClientRect.top) {
          topmost = entry;
        }
      }
      if (!topmost) return;
      const btn = buttons.get(topmost.target as HTMLElement);
      if (!btn) return;
      for (const other of buttons.values()) other.classList.remove("is-current");
      btn.classList.add("is-current");
    },
    { threshold: SPY_THRESHOLD },
  );
  sections.forEach((section) => observer.observe(section));

  return (): void => {
    observer.disconnect();
    for (const cleanup of cleanups) cleanup();
    nav.remove();
  };
}
