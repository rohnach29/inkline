import { describe, it, expect } from "vitest";
import { renderBook } from "./pages";
import { esc, drawDurationMs } from "./svg";
import { makeSyntheticYear } from "../fixtures/synthetic";
import { analyzeYear } from "../analyze";
import { buildBook } from "../storytell";
import type { Book, Chapter } from "../storytell";
import type { Year } from "../ingest";

const year = makeSyntheticYear();
const story = analyzeYear(year);
const book = buildBook(year, story);

function emptyYear(): Year {
  return { runs: [], places: [], span: { firstUtc: 0, lastUtc: 0 } };
}

/** Strip all HTML tags, leaving only text content (and untouched literal
 *  spaces that pages.ts emits between tilt spans). */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** The full <section>…</section> substring whose opening tag carries the
 *  given data-page value. Sections never nest, so lastIndexOf/indexOf around
 *  the marker is exact. */
function sectionFor(html: string, dataPage: string): string {
  const at = html.indexOf(`data-page="${dataPage}"`);
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<section", at);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

/** Minimal single-chapter Book for map-area pinning tests. */
function oneChapterBook(chapter: Chapter): Book {
  return {
    seed: 1,
    title: "Strip Test",
    subtitle: "a very short book of running",
    dedication: ["for testing"],
    chapters: [chapter],
    beasts: [],
    colophon: { runCount: 1, gpsRunCount: 1, totalKm: 5, places: [], note: "note" },
  };
}

function baseChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: "test:1",
    kicker: "in which we test",
    title: "Plain Title",
    poem: {
      id: "first-run/test-poem",
      form: "quatrain",
      lines: [{ text: "one" }, { text: "two" }, { text: "three" }, { text: "four" }],
    },
    stats: [{ label: "distance", value: "5.0 km" }],
    mapSpec: null,
    sceneParams: {},
    atmosphereTags: [],
    eventType: "first-run",
    ...overrides,
  };
}

/** Year with a single tracked run "r1" (3 GPS points, enough for routeSvg). */
function trackedYear(): Year {
  const run = {
    id: "r1",
    startUtc: 1_000_000,
    startLocal: "2025-06-01T07:00:00",
    tz: "Asia/Kolkata",
    timezoneUncertain: false,
    km: 5,
    minutes: 30,
    elevationGain: 10,
    indoor: false,
    track: [
      { lat: 19.07, lon: 72.87, ele: 5, t: 0 },
      { lat: 19.08, lon: 72.88, ele: 6, t: 60_000 },
      { lat: 19.09, lon: 72.87, ele: 5, t: 120_000 },
    ],
    placeId: null,
  };
  return { runs: [run], places: [], span: { firstUtc: run.startUtc, lastUtc: run.startUtc } };
}

/** Reverse of svg.ts's esc(), for reconstructing original text from
 *  per-letter-tilted, escaped title markup. */
function unescapeAll(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("renderBook", () => {
  it("emits exactly one id=\"wobble\" filter definition", () => {
    const html = renderBook(book, year);
    const matches = html.match(/id="wobble"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("emits one <section> per cover + dedication + colophon + chapters/empty-page + beasts(optional)", () => {
    const html = renderBook(book, year);
    const sectionCount = (html.match(/<section/g) ?? []).length;
    // A zero-chapter book still renders exactly one body section (the
    // authored empty-year page), hence max(chapters, 1) rather than a bare
    // chapters term.
    const expected =
      3 + Math.max(book.chapters.length, 1) + (book.beasts.length > 0 ? 1 : 0);
    expect(book.beasts.length).toBeGreaterThan(0); // fixture guard: beasts page must be exercised
    expect(sectionCount).toBe(expected);
  });

  it("emits exactly 4 sections for an empty-year book (cover, dedication, empty page, colophon)", () => {
    const y = emptyYear();
    const s = analyzeYear(y);
    const emptyBook = buildBook(y, s);
    expect(emptyBook.chapters.length).toBe(0); // fixture guard
    expect(emptyBook.beasts.length).toBe(0); // fixture guard: no beasts page
    const html = renderBook(emptyBook, y);
    expect((html.match(/<section/g) ?? []).length).toBe(4);
  });

  it("renders no game page", () => {
    const html = renderBook(book, year);
    expect(html).not.toContain("page-game");
    expect(html).not.toContain("game-mount");
    expect(html).not.toContain("Outrun the Quiet");
  });

  it("renders one ink scene per chapter, on the cover, and per beast", () => {
    const html = renderBook(book, year);
    const sceneCount = (html.match(/class="ink-scene"/g) ?? []).length;
    expect(sceneCount).toBe(book.chapters.length + 1 + book.beasts.length);
    expect(html).not.toContain("ink-doodle");
  });

  it("includes every chapter title (reconstructed from tilt spans) and every poem line", () => {
    const html = renderBook(book, year);
    const plain = unescapeAll(stripTags(html));
    for (const chapter of book.chapters) {
      expect(plain).toContain(chapter.title);
      for (const line of chapter.poem.lines) {
        if (line.text === "") continue;
        expect(html).toContain(esc(line.text));
      }
    }
  });

  it("renders poem form class and line modifiers", () => {
    const poem = { id: "first-run/modifier-fixture", form: "dialogue" as const, lines: [
      { text: "Who goes there?", voice: 1 as const },
      { text: "Me. Again. Still.", voice: 2 as const },
      { text: "", },
      { text: "CLOSED", align: "center" as const, size: "large" as const },
      { text: "step two,", indent: 2 as const },
    ]};
    const html = renderBook({ ...book, chapters: [{ ...book.chapters[0]!, poem }] }, year);
    expect(html).toContain('class="poem poem-dialogue"');
    expect(html).toContain('class="verse poem-line voice-1"');
    expect(html).toContain('class="verse poem-line voice-2"');
    expect(html).toContain('<div class="poem-gap"></div>');
    expect(html).toContain("align-center");
    expect(html).toContain("size-large");
    expect(html).toContain("indent-2");
  });

  it("renders a coda block only when the poem carries one", () => {
    const base = baseChapter({});
    const withCoda = {
      ...base,
      poem: { ...base.poem, coda: [{ text: "P.S. the shadow says hi." }] },
    };
    const html = renderBook({ ...book, chapters: [withCoda] }, year);
    expect(html).toContain('<div class="poem-coda">');
    expect(html).toContain("P.S. the shadow says hi.");
    const plain = renderBook({ ...book, chapters: [base] }, year);
    expect(plain).not.toContain("poem-coda");
  });

  it("tilt-spans a title containing '&' into &amp; entities with no raw ampersand left over", () => {
    const minimal: Book = {
      seed: 1,
      title: "Ampersand & Son",
      subtitle: "a very short book of running",
      dedication: ["for testing"],
      chapters: [],
      beasts: [],
      colophon: { runCount: 0, gpsRunCount: 0, totalKm: 0, places: [], note: "note" },
    };
    const html = renderBook(minimal, emptyYear());
    expect(html).toContain("&amp;");
    expect(html).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/);
  });

  it("gives route chapters an ink-map and the journey chapter an ink-arc", () => {
    const html = renderBook(book, year);
    const hasRouteChapter = book.chapters.some((c) => c.mapSpec?.kind === "route");
    expect(hasRouteChapter).toBe(true); // fixture guard
    expect(html).toContain('class="ink-map"');

    const journey = book.chapters.find((c) => c.eventType === "journey");
    expect(journey).toBeDefined();
    expect(html).toContain("ink-arc");
  });

  it("stamps each chapter's data-atmosphere with its atmosphereTags joined by space", () => {
    const html = renderBook(book, year);
    for (const chapter of book.chapters) {
      const attr = `data-atmosphere="${esc(chapter.atmosphereTags.join(" "))}"`;
      expect(html).toContain(attr);
    }
  });

  it("prints every stat's label and value", () => {
    const html = renderBook(book, year);
    for (const chapter of book.chapters) {
      for (const stat of chapter.stats) {
        expect(html).toContain(esc(stat.label));
        expect(html).toContain(esc(stat.value));
      }
    }
  });

  it("colophon contains totalKm with ' km', the privacy note verbatim, and the determinism line", () => {
    const html = renderBook(book, year);
    expect(html).toContain(`${book.colophon.totalKm} km`);
    expect(html).toContain(book.colophon.note);
    expect(html).toContain("drawn deterministically — the same year makes the same book, forever.");
  });

  it("is deterministic across repeated calls", () => {
    const a = renderBook(book, year);
    const b = renderBook(book, year);
    expect(a).toBe(b);
  });

  it("renders the authored empty-year page for an empty Book, with no chapter pages", () => {
    const y = emptyYear();
    const s = analyzeYear(y);
    const emptyBook = buildBook(y, s);
    expect(emptyBook.chapters.length).toBe(0); // fixture guard

    const html = renderBook(emptyBook, y);
    expect(unescapeAll(stripTags(html))).toContain("A Blank Page, For Now");
    expect(html).not.toContain("page-chapter");
  });

  it("never throws and renders an empty map area when a route mapSpec's runId is missing from year.runs", () => {
    const minimal: Book = {
      seed: 1,
      title: "Missing Run",
      subtitle: "a very short book of running",
      dedication: ["for testing"],
      chapters: [
        {
          id: "route:1",
          kicker: "in which the map is lost",
          title: "Nowhere Found",
          poem: {
            id: "first-run/missing-map-fixture",
            form: "quatrain",
            lines: [{ text: "one line" }, { text: "two line" }, { text: "three line" }, { text: "four line" }],
          },
          stats: [{ label: "distance", value: "5.0 km" }],
          mapSpec: { kind: "route", runId: "does-not-exist" },
          sceneParams: {},
          atmosphereTags: [],
          eventType: "first-run",
        },
      ],
      beasts: [],
      colophon: { runCount: 1, gpsRunCount: 0, totalKm: 5, places: [], note: "note" },
    };

    let html = "";
    expect(() => {
      html = renderBook(minimal, emptyYear());
    }).not.toThrow();
    expect(html).not.toContain('class="ink-map"');
    expect(html).toContain('<div class="map-area"></div>');
    // The chapter's ink scene still carries the illustration even though
    // the map area degraded to empty.
    expect(html).toContain('class="ink-scene"');
  });

  it("stamps a route map's svg with data-draw-ms equal to drawDurationMs of the run's pace", () => {
    // trackedYear's run "r1": km=5, minutes=30 -> pace 6 min/km
    const chapter = baseChapter({
      mapSpec: { kind: "route", runId: "r1" },
    });
    const html = renderBook(oneChapterBook(chapter), trackedYear());
    const section = sectionFor(html, "ch-1");
    const expectedMs = drawDurationMs(30 / 5);
    expect(section).toContain(`data-draw-ms="${expectedMs}"`);
  });

  it("stamps a flight map's svg with a fixed data-draw-ms of 4000", () => {
    const chapter = baseChapter({
      mapSpec: {
        kind: "flight",
        from: { lat: 19.08, lon: 72.88, name: "Mumbai" },
        to: { lat: 40.42, lon: -86.92, name: "Lafayette" },
        km: 12842,
      },
      eventType: "journey",
    });
    const html = renderBook(oneChapterBook(chapter), trackedYear());
    const section = sectionFor(html, "ch-1");
    expect(section).toContain('data-draw-ms="4000"');
  });

  it("gives a chapter with no mapSpec an empty map area and no data-draw-ms attribute", () => {
    const chapter = baseChapter({ mapSpec: null });
    const html = renderBook(oneChapterBook(chapter), trackedYear());
    const section = sectionFor(html, "ch-1");
    expect(section).not.toContain("data-draw-ms");
    expect(section).toContain('<div class="map-area"></div>');
  });

  it("gives a missing-run route mapSpec no data-draw-ms attribute", () => {
    const chapter = baseChapter({
      mapSpec: { kind: "route", runId: "does-not-exist" },
    });
    const html = renderBook(oneChapterBook(chapter), trackedYear());
    const section = sectionFor(html, "ch-1");
    expect(section).not.toContain("data-draw-ms");
  });
});
