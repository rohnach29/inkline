import { specFor, spawn, step } from "./particles";
import type { P, ParticleSpec } from "./particles";

const CHAPTER_SELECTOR = ".page-chapter";
const CROSSFADE_MS = 600;
const DEFAULT_INK = "#26211a";

/** `specFor`'s tag is derived from a chapter's `data-atmosphere` attribute —
 *  space-separated (a chapter can carry more than one, e.g. "monsoon
 *  fireflies"); the active system is always the FIRST tag. */
function firstTag(section: HTMLElement): string {
  const raw = section.getAttribute("data-atmosphere") ?? "";
  const first = raw.trim().split(/\s+/)[0];
  return first ?? "";
}

/** Finds the `.page-chapter` with the greatest fraction of its own height
 *  currently inside the viewport. Returns undefined if none are visible at
 *  all (e.g. mid-scroll past the last chapter, or before the first one). */
function mostVisibleChapter(sections: HTMLElement[]): HTMLElement | undefined {
  const vh = window.innerHeight || document.documentElement.clientHeight;
  let best: HTMLElement | undefined;
  let bestRatio = 0;
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const height = rect.height || 1;
    const ratio = Math.max(0, visible) / height;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = section;
    }
  }
  return best;
}

function readInk(): string {
  const value = getComputedStyle(document.body).getPropertyValue("--ink").trim();
  return value || DEFAULT_INK;
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  ps: P[],
  tag: string,
  ink: string,
  fade: number,
): void {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  for (const p of ps) {
    const a = p.alpha * fade;
    if (a <= 0.002) continue;
    ctx.globalAlpha = a;

    if (tag === "monsoon") {
      // 6px streak trailing behind the drop, aligned to its fall velocity.
      const speed = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / speed;
      const uy = p.vy / speed;
      const len = 6;
      ctx.lineWidth = Math.max(0.5, p.size);
      ctx.beginPath();
      ctx.moveTo(p.x - ux * len, p.y - uy * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (tag === "leaves") {
      // Short tilted stroke, angled along its drift direction.
      const angle = Math.atan2(p.vy, p.vx);
      const half = p.size;
      const dx = Math.cos(angle) * half;
      const dy = Math.sin(angle) * half;
      ctx.lineWidth = Math.max(0.75, p.size * 0.5);
      ctx.beginPath();
      ctx.moveTo(p.x - dx, p.y - dy);
      ctx.lineTo(p.x + dx, p.y + dy);
      ctx.stroke();
    } else {
      // fireflies, snow: simple dots.
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Wires the atmosphere canvas: a single fixed-position, pointer-events-none
 *  overlay that paints sparse, monochrome ink-fleck "weather" over whichever
 *  chapter is most visible, keyed to that chapter's `data-atmosphere` tag.
 *  Skips entirely (returns undefined, installs nothing) when the device
 *  reports `hardwareConcurrency <= 2` — this is a screen-only enhancement,
 *  never worth the frame budget on low-power hardware. Callers are expected
 *  to have already gated on `prefers-reduced-motion` before reaching here
 *  (see `index.ts`), same as the rest of the living-book layer. */
export function initAtmosphere(root: ParentNode): (() => void) | undefined {
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) {
    return undefined;
  }

  const sections = Array.from(root.querySelectorAll<HTMLElement>(CHAPTER_SELECTOR));
  if (sections.length === 0) return undefined;

  const canvas = document.createElement("canvas");
  canvas.className = "atmosphere-canvas no-print";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) {
    canvas.remove();
    return undefined;
  }
  // Narrowed once here; TS control-flow analysis doesn't carry a non-null
  // narrowing of an outer `const` into nested closures below (`frame`), so
  // this rebinding gives every closure a provably non-null reference.
  const ctx: CanvasRenderingContext2D = maybeCtx;

  let ink = readInk();
  let dpr = window.devicePixelRatio || 1;

  function resize(): void {
    dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  resize();
  window.addEventListener("resize", resize);

  const themeObserver = new MutationObserver(() => {
    ink = readInk();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  let activeTag = "";
  let spec: ParticleSpec | null = null;
  let particles: P[] = [];

  let prevTag = "";
  let prevSpec: ParticleSpec | null = null;
  let prevParticles: P[] = [];
  let fadeStart = performance.now() - CROSSFADE_MS; // no fade pending at start

  function switchTag(tag: string): void {
    prevTag = activeTag;
    prevSpec = spec;
    prevParticles = particles;

    activeTag = tag;
    spec = specFor(tag);
    const w = window.innerWidth;
    const h = window.innerHeight;
    particles = spec ? spawn(spec, w, h, Math.random) : [];
    fadeStart = performance.now();
  }

  let paused = document.hidden;
  let last = performance.now();
  let rafId = 0;

  function onVisibility(): void {
    paused = document.hidden;
    if (!paused) {
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }
  document.addEventListener("visibilitychange", onVisibility);

  function frame(now: number): void {
    if (paused) return;
    const dtMs = now - last;
    last = now;

    const chapter = mostVisibleChapter(sections);
    const tag = chapter ? firstTag(chapter) : "";
    if (tag !== activeTag) switchTag(tag);

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (spec) step(particles, spec, w, h, dtMs);
    if (prevSpec) step(prevParticles, prevSpec, w, h, dtMs);

    const fadeT = Math.min(1, (now - fadeStart) / CROSSFADE_MS);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (prevSpec && fadeT < 1) drawParticles(ctx, prevParticles, prevTag, ink, 1 - fadeT);
    if (spec) drawParticles(ctx, particles, activeTag, ink, fadeT);
    if (fadeT >= 1) {
      prevSpec = null;
      prevParticles = [];
    }

    rafId = requestAnimationFrame(frame);
  }

  if (!paused) rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
    themeObserver.disconnect();
    canvas.remove();
  };
}
