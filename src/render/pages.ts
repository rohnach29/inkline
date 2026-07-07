import type { Book, Chapter, MapSpec } from "../storytell";
import type { ChapterPoem } from "../storytell";
import type { Year } from "../ingest";
import { routeSvg, flightSvg, esc, drawDurationMs } from "./svg";
import { renderScene } from "../ink";
import type { SceneParams } from "../ink";
import { Rng } from "../storytell/rng";

/** Emitted exactly once, at the top of renderBook's output. Every ink-route/
 *  ink-globe/ink-graticule/ink-arc stroke in this file references
 *  filter="url(#wobble)" against this single definition — ink SCENES do not
 *  (the stroke engine wobbles its own paths), so they're unaffected by this
 *  defs block. Exported so living/share.ts can embed the same defs into each
 *  rasterized page's standalone SVG — the filter lives at book root, OUTSIDE
 *  every `.page`, so a cloned section alone would render its routes
 *  unfiltered (losing the hand-drawn wobble). */
export const WOBBLE_DEFS =
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

/** Stamps `data-draw-ms="{ms}"` onto a top-level `<svg ...>` string's opening
 *  tag, for the living-book layer to read the self-drawing-ink duration from.
 *  Assumes `svgHtml` starts with `<svg ` (true of routeSvg/flightSvg output). */
function withDrawMs(svgHtml: string, ms: number): string {
  return svgHtml.replace("<svg ", `<svg data-draw-ms="${ms}" `);
}

// -------------------------------------------------------------------------
// Chapter map area — route svg or flight svg only. Never throws: a
// missing/trackless run, or an empty routeSvg result, degrades to "" (the
// chapter's ink scene below always carries the illustration now).
// -------------------------------------------------------------------------

function renderMapArea(mapSpec: MapSpec | null, year: Year): string {
  if (mapSpec) {
    if (mapSpec.kind === "route") {
      const run = year.runs.find((r) => r.id === mapSpec.runId);
      if (run?.track && run.track.length > 0) {
        const svg = routeSvg(run.track, run.id);
        if (svg) {
          const pace = run.km > 0 ? run.minutes / run.km : null;
          return withDrawMs(svg, drawDurationMs(pace));
        }
      }
    } else {
      const svg = flightSvg(mapSpec.from, mapSpec.to, mapSpec.km);
      return withDrawMs(svg, FLIGHT_DRAW_MS);
    }
  }
  return "";
}

// -------------------------------------------------------------------------
// Page renderers
// -------------------------------------------------------------------------

function renderCover(book: Book, rng: Rng): string {
  const scene = renderScene("cover", {}, rng.fork("scene:cover"));
  return [
    `<section class="page page-cover" data-page="cover">`,
    `<h1 class="book-title">${tiltSpan(book.title)}</h1>`,
    `<p class="book-subtitle">${esc(book.subtitle)}</p>`,
    `<div class="cover-scene">${scene}</div>`,
    `</section>`,
  ].join("");
}

function renderDedication(book: Book): string {
  const lines = book.dedication.map((line) => `<div class="dedication">${esc(line)}</div>`).join("");
  return `<section class="page page-dedication" data-page="dedication">${lines}</section>`;
}

function renderPoemLine(l: ChapterPoem["lines"][number]): string {
  if (l.text === "") return `<div class="poem-gap"></div>`;
  const cls = ["verse", "poem-line"];
  if (l.indent) cls.push(`indent-${l.indent}`);
  if (l.align !== undefined && l.align !== "left") cls.push(`align-${l.align}`);
  if (l.size !== undefined && l.size !== "normal") cls.push(`size-${l.size}`);
  return `<div class="${cls.join(" ")}">${esc(l.text)}</div>`;
}

function renderPoem(poem: ChapterPoem): string {
  const lines = poem.lines.map(renderPoemLine).join("");
  const coda = poem.coda
    ? `<div class="poem-coda">${poem.coda.map(renderPoemLine).join("")}</div>`
    : "";
  return `<div class="poem poem-${poem.form}">${lines}${coda}</div>`;
}

function renderChapter(chapter: Chapter, index: number, year: Year, rng: Rng): string {
  const atmosphere = esc(chapter.atmosphereTags.join(" "));
  const poemHtml = renderPoem(chapter.poem);
  const mapAreaHtml = renderMapArea(chapter.mapSpec, year);
  const statsRows = chapter.stats
    .map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`)
    .join("");
  const scene = renderScene(
    chapter.eventType,
    chapter.sceneParams as SceneParams,
    rng.fork(`scene:${chapter.id}`),
  );

  return [
    `<section class="page page-chapter" data-page="ch-${index}" data-event="${esc(chapter.eventType)}" data-atmosphere="${atmosphere}">`,
    `<div class="kicker">${esc(chapter.kicker)}</div>`,
    `<h2 class="chapter-title">${tiltSpan(chapter.title)}</h2>`,
    poemHtml,
    `<div class="map-area">${mapAreaHtml}</div>`,
    `<dl class="stats">${statsRows}</dl>`,
    `<div class="scene-area">${scene}</div>`,
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

function renderBeasts(book: Book, rng: Rng): string {
  const entries = book.beasts
    .map((b) =>
      [
        `<div class="beast-entry">`,
        renderScene(`beast-${b.kind}`, {}, rng.fork(`scene:beast:${b.name}`)),
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
 *  year.runs (or whose run has no usable track) degrades to an empty map
 *  area — the chapter's ink scene still carries the illustration. */
export function renderBook(book: Book, year: Year): string {
  const rng = new Rng(book.seed);
  const parts: string[] = [WOBBLE_DEFS, renderCover(book, rng), renderDedication(book)];

  if (book.chapters.length === 0) {
    parts.push(renderEmptyYearPage());
  } else {
    book.chapters.forEach((chapter, i) => {
      parts.push(renderChapter(chapter, i + 1, year, rng));
    });
  }

  if (book.beasts.length > 0) {
    parts.push(renderBeasts(book, rng));
  }

  parts.push(renderColophon(book));

  return parts.join("");
}
