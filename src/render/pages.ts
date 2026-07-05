import type { Book, Chapter, MapSpec } from "../storytell";
import type { Year } from "../ingest";
import { routeSvg, flightSvg, esc, drawDurationMs } from "./svg";
import { doodleFor } from "./doodles";

/** Emitted exactly once, at the top of renderBook's output. Every ink-* and
 *  ink-doodle stroke in this file references filter="url(#wobble)" against
 *  this single definition. */
const WOBBLE_DEFS =
  '<svg style="position:absolute;width:0;height:0" aria-hidden="true"><defs><filter id="wobble"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter></defs></svg>';

// -------------------------------------------------------------------------
// Empty-book authored copy — const, in-voice, deterministic.
// -------------------------------------------------------------------------

const EMPTY_BOOK_KICKER = "in which the shoes wait";
const EMPTY_BOOK_TITLE = "A Blank Page, For Now";
const EMPTY_BOOK_LINES = [
  "No runs to read. The book is thin.",
  "But every book starts thinner than it ends.",
] as const;

const DETERMINISM_LINE = "drawn deterministically — the same year makes the same book, forever.";
const BEASTS_KICKER = "a field guide to what chased you";

const FALLBACK_DOODLE_TAG = "shoes";

/** Flight maps have no meaningful "pace" (they're not a run), so the
 *  self-drawing-ink layer gets a fixed duration for them. */
const FLIGHT_DRAW_MS = 4000;

// -------------------------------------------------------------------------
// Per-letter tilt
// -------------------------------------------------------------------------

const TILT_CLASSES = ["tilt-a", "tilt-b", "tilt-c"] as const;

/** Wrap each non-space char of `text` in a cycling tilt-a|tilt-b|tilt-c span,
 *  escaping every char through esc(). Spaces pass through un-wrapped and
 *  don't advance the cycle, so word shapes read naturally under CSS rotation. */
function tiltSpan(text: string): string {
  let out = "";
  let i = 0;
  for (const ch of text) {
    if (ch === " ") {
      out += " ";
      continue;
    }
    const cls = TILT_CLASSES[i % 3]!;
    out += `<span class="${cls}">${esc(ch)}</span>`;
    i++;
  }
  return out;
}

// -------------------------------------------------------------------------
// Doodle fallback helpers
// -------------------------------------------------------------------------

interface DoodlePick {
  html: string;
  /** Index into `tags` of the tag that was rendered, or -1 when the ultimate
   *  "shoes" fallback was used (no listed tag was consumed). */
  usedTagIndex: number;
}

/** Stamps `data-draw-ms="{ms}"` onto a top-level `<svg ...>` string's opening
 *  tag, for the living-book layer to read the self-drawing-ink duration from.
 *  Assumes `svgHtml` starts with `<svg ` (true of routeSvg/flightSvg output). */
function withDrawMs(svgHtml: string, ms: number): string {
  return svgHtml.replace("<svg ", `<svg data-draw-ms="${ms}" `);
}

/** First tag (in order) that resolves to a non-empty doodle; "shoes" if none do. */
function firstDoodle(tags: readonly string[]): DoodlePick {
  for (let i = 0; i < tags.length; i++) {
    const svg = doodleFor(tags[i]!);
    if (svg) return { html: svg, usedTagIndex: i };
  }
  return { html: doodleFor(FALLBACK_DOODLE_TAG), usedTagIndex: -1 };
}

// -------------------------------------------------------------------------
// Chapter map area — route svg, flight svg, or doodle fallback. Never throws:
// a missing/trackless run, or an empty routeSvg result, degrades to the
// chapter's first doodle tag (or "shoes" if that's empty/unknown too).
// -------------------------------------------------------------------------

interface MapArea {
  html: string;
  /** Index of the doodleTag the map area consumed as its fallback, or -1
   *  when a real route/flight svg (or the ultimate "shoes" fallback) was
   *  rendered — i.e. when no listed tag was used up by the map area. */
  usedTagIndex: number;
}

function renderMapArea(mapSpec: MapSpec | null, doodleTags: readonly string[], year: Year): MapArea {
  if (mapSpec) {
    if (mapSpec.kind === "route") {
      const run = year.runs.find((r) => r.id === mapSpec.runId);
      if (run?.track && run.track.length > 0) {
        const svg = routeSvg(run.track, run.id);
        if (svg) {
          const pace = run.km > 0 ? run.minutes / run.km : null;
          return { html: withDrawMs(svg, drawDurationMs(pace)), usedTagIndex: -1 };
        }
      }
    } else {
      const svg = flightSvg(mapSpec.from, mapSpec.to, mapSpec.km);
      return { html: withDrawMs(svg, FLIGHT_DRAW_MS), usedTagIndex: -1 };
    }
  }
  return firstDoodle(doodleTags);
}

// -------------------------------------------------------------------------
// Page renderers
// -------------------------------------------------------------------------

function renderCover(book: Book): string {
  const firstTag = book.chapters[0]?.doodleTags[0];
  const doodle = firstTag ? (doodleFor(firstTag) || doodleFor(FALLBACK_DOODLE_TAG)) : doodleFor(FALLBACK_DOODLE_TAG);
  return [
    `<section class="page page-cover" data-page="cover">`,
    `<h1 class="book-title">${tiltSpan(book.title)}</h1>`,
    `<p class="book-subtitle">${esc(book.subtitle)}</p>`,
    `<div class="cover-doodle">${doodle}</div>`,
    `</section>`,
  ].join("");
}

function renderDedication(book: Book): string {
  const lines = book.dedication.map((line) => `<div class="dedication">${esc(line)}</div>`).join("");
  return `<section class="page page-dedication" data-page="dedication">${lines}</section>`;
}

function renderChapter(chapter: Chapter, index: number, year: Year): string {
  const atmosphere = esc(chapter.atmosphereTags.join(" "));
  const verseHtml = chapter.verse.map((line) => `<div class="verse">${esc(line)}</div>`).join("");
  const mapArea = renderMapArea(chapter.mapSpec, chapter.doodleTags, year);
  const statsRows = chapter.stats
    .map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`)
    .join("");
  // Strip = every doodleTag EXCEPT the one the map area actually consumed as
  // its fallback. When the map rendered a real route/flight svg (no doodle
  // consumed, usedTagIndex -1), ALL tags render in the strip.
  const strip = chapter.doodleTags
    .filter((_, i) => i !== mapArea.usedTagIndex)
    .map((t) => doodleFor(t))
    .filter((svg) => svg.length > 0)
    .join("");

  return [
    `<section class="page page-chapter" data-page="ch-${index}" data-event="${esc(chapter.eventType)}" data-atmosphere="${atmosphere}">`,
    `<div class="kicker">${esc(chapter.kicker)}</div>`,
    `<h2 class="chapter-title">${tiltSpan(chapter.title)}</h2>`,
    verseHtml,
    `<div class="map-area">${mapArea.html}</div>`,
    `<dl class="stats">${statsRows}</dl>`,
    strip ? `<div class="doodle-strip">${strip}</div>` : "",
    `</section>`,
  ].join("");
}

function renderEmptyYearPage(): string {
  const lines = EMPTY_BOOK_LINES.map((l) => `<div class="verse">${esc(l)}</div>`).join("");
  return [
    `<section class="page page-empty" data-page="empty-year">`,
    `<div class="kicker">${esc(EMPTY_BOOK_KICKER)}</div>`,
    `<h2 class="chapter-title">${tiltSpan(EMPTY_BOOK_TITLE)}</h2>`,
    lines,
    `</section>`,
  ].join("");
}

function renderBeasts(book: Book): string {
  const entries = book.beasts
    .map((b) =>
      [
        `<div class="beast-entry">`,
        firstDoodle([b.doodleTag]).html,
        `<div class="beast-name">${esc(b.name)}</div>`,
        `<div class="beast-desc">${esc(b.description)}</div>`,
        `</div>`,
      ].join(""),
    )
    .join("");

  return [
    `<section class="page page-beasts" data-page="beasts">`,
    `<div class="kicker">${esc(BEASTS_KICKER)}</div>`,
    entries,
    `</section>`,
  ].join("");
}

function renderColophon(book: Book): string {
  const c = book.colophon;
  const placesLine = c.places.length > 0 ? c.places.join(", ") : "no named places — the roads keep their secrets";

  return [
    `<section class="page page-colophon" data-page="colophon">`,
    `<div class="colophon-line">${c.runCount} runs recorded, ${c.gpsRunCount} with a map</div>`,
    `<div class="colophon-line">${c.totalKm} km, all told</div>`,
    `<div class="colophon-line">${esc(placesLine)}</div>`,
    `<div class="colophon-note">${esc(c.note)}</div>`,
    `<div class="colophon-determinism">${esc(DETERMINISM_LINE)}</div>`,
    `</section>`,
  ].join("");
}

// -------------------------------------------------------------------------
// renderBook
// -------------------------------------------------------------------------

/** The entire book as an HTML string of consecutive <section class="page" …>
 *  elements, preceded by the wobble-filter defs svg (rendered exactly once).
 *  Pure, deterministic, never throws: a route mapSpec whose runId isn't in
 *  year.runs (or whose run has no usable track) degrades to a doodle. */
export function renderBook(book: Book, year: Year): string {
  const parts: string[] = [WOBBLE_DEFS, renderCover(book), renderDedication(book)];

  if (book.chapters.length === 0) {
    parts.push(renderEmptyYearPage());
  } else {
    book.chapters.forEach((chapter, i) => {
      parts.push(renderChapter(chapter, i + 1, year));
    });
  }

  if (book.beasts.length > 0) {
    parts.push(renderBeasts(book));
  }

  parts.push(renderColophon(book));

  return parts.join("");
}
