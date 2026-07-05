import { describe, it, expect } from "vitest";
import { renderBook } from "./pages";
import { esc } from "./svg";
import { makeSyntheticYear } from "../fixtures/synthetic";
import { analyzeYear } from "../analyze";
import { buildBook } from "../storytell";
import type { Book } from "../storytell";
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

  it("emits one <section> per cover + dedication + colophon + chapters + beasts(optional)", () => {
    const html = renderBook(book, year);
    const sectionCount = (html.match(/<section/g) ?? []).length;
    const expected = book.chapters.length + 3 + (book.beasts.length > 0 ? 1 : 0);
    expect(book.beasts.length).toBeGreaterThan(0); // fixture guard: beasts page must be exercised
    expect(sectionCount).toBe(expected);
  });

  it("includes every chapter title (reconstructed from tilt spans) and every verse line", () => {
    const html = renderBook(book, year);
    const plain = unescapeAll(stripTags(html));
    for (const chapter of book.chapters) {
      expect(plain).toContain(chapter.title);
      for (const line of chapter.verse) {
        expect(html).toContain(esc(line));
      }
    }
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

  it("never throws and falls back to a doodle when a route mapSpec's runId is missing from year.runs", () => {
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
          verse: ["one line", "two line", "three line", "four line"],
          stats: [{ label: "distance", value: "5.0 km" }],
          mapSpec: { kind: "route", runId: "does-not-exist" },
          doodleTags: ["shoes"],
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
    expect(html).toContain('class="ink-doodle"');
    expect(html).not.toContain('class="ink-map"');
  });
});
