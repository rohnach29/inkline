import { specFor, spawn, step } from "./particles";
import type { P, ParticleSpec } from "./particles";

const CHAPTER_SELECTOR = ".page-chapter";
const CROSSFADE_MS = 600;
const DEFAULT_INK = "#26211a";
/** Hard ceiling on a single frame's delta-time. OS sleep/wake, a long main-
 *  thread stall, or a background tab resuming without a `visibilitychange`
 *  firing in time can all produce a multi-second `dtMs`; without a clamp
 *  `step()` would move every particle that many (simulated) seconds in one
 *  jump, i.e. a visible teleport. Clamping means the frame just renders a
 *  little slow rather than skipping ahead. */
const MAX_DT_MS = 100;

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

/** Pure crossfade-alpha computation for the two-generation particle
 *  crossfade. `fadeT` is how far (0..1) into the current `CROSSFADE_MS`
 *  window we are; `carry` is the outgoing ("prev") system's own alpha
 *  multiplier at the exact moment it was demoted from active to prev.
 *
 *  The incoming ("active") system always fades in linearly 0 -> 1 — a fresh
 *  system never has anywhere else to fade in from. The outgoing system
 *  fades out from `carry` -> 0 over the same window: at `fadeT === 0` its
 *  multiplier is exactly `carry`, so if a tag switch lands mid-fade and the
 *  caller passes in the just-interrupted active alpha as the new `carry`,
 *  the visible opacity is continuous across the switch instead of snapping
 *  up to full (or down to zero). */
export function crossfadeAlpha(fadeT: number, carry: number): { prevAlpha: number; activeAlpha: number } {
  const t = Math.min(1, Math.max(0, fadeT));
  return {
    prevAlpha: carry * (1 - t),
    activeAlpha: t,
  };
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
  // `?? 4` guards against a `0` reading (some browsers/privacy modes report
  // it instead of omitting the property) — treat that as low-power too,
  // rather than "0 <= 2 is true but let's not skip" falling through.
  if (typeof navigator !== "undefined" && (navigator.hardwareConcurrency ?? 4) <= 2) {
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
  let prevCarry = 1; // outgoing system's alpha multiplier at time of demotion
  let fadeStart = performance.now() - CROSSFADE_MS; // no fade pending at start

  function switchTag(tag: string): void {
    // How far the CURRENT fade had progressed when this switch landed. If a
    // tag change arrives mid-fade (fadeT < 1), the system being demoted to
    // "prev" was only partially faded in — carry that exact multiplier into
    // its outgoing fade so it continues smoothly from wherever it was
    // instead of resetting to full opacity (see crossfadeAlpha). The
    // previous "prev" generation (already fading out) is simply dropped —
    // only two generations are ever tracked.
    const interruptedAlpha = Math.min(1, Math.max(0, (performance.now() - fadeStart) / CROSSFADE_MS));

    prevTag = activeTag;
    prevSpec = spec;
    prevParticles = particles;
    prevCarry = interruptedAlpha;

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
    const dtMs = Math.min(now - last, MAX_DT_MS);
    last = now;

    const chapter = mostVisibleChapter(sections);
    const tag = chapter ? firstTag(chapter) : "";
    if (tag !== activeTag) switchTag(tag);

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (spec) step(particles, spec, w, h, dtMs);
    if (prevSpec) step(prevParticles, prevSpec, w, h, dtMs);

    const fadeT = Math.min(1, (now - fadeStart) / CROSSFADE_MS);
    const { prevAlpha, activeAlpha } = crossfadeAlpha(fadeT, prevCarry);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (prevSpec && fadeT < 1) drawParticles(ctx, prevParticles, prevTag, ink, prevAlpha);
    if (spec) drawParticles(ctx, particles, activeTag, ink, activeAlpha);
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
