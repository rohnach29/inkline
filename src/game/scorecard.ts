import type { Rng } from "../storytell/rng";

/** Honest numbers only — the score card never inflates a run. */
export interface ScoreFacts {
  kmSurvived: number;
  realKm: number;
  beastHits: number;
  furthestBeast: string | null;
}

/** HTML-escape &, <, >, ", ' (mirrors src/render/svg.ts esc, kept local so
 *  this file has no import beyond Rng — it is the game's own leaf module). */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The card's one-line poem bank — Silverstein register. The fog always wins
 * in the end (physics ramps it up so every run terminates); these lines are
 * written for that ending: nightfall, not failure. Concrete, wry, kid-serious,
 * with real feeling sitting right under the joke.
 */
const CARD_LINES: readonly string[] = [
  "You outran it for a while. That counts. It always counted.",
  "The Quiet always wins the last mile. You won every mile before it.",
  "Nightfall isn't a defeat. It's just the day, done being polite about ending.",
  "The fog caught up the way bedtime does: not angry, just done asking.",
  "You got past the pebble, the hill, and the ghost. The dark was always going to be the one that got you.",
  "Every run ends in The Quiet eventually. Yours ended with a very respectable head start.",
  "That's not losing. That's just what it looks like when the day finally sits down.",
  "The beasts you left behind are still back there, arguing about how far you got.",
  "You didn't beat The Quiet. You made it wait. It is not used to waiting.",
  "The fog finished first. It cheated: it never has to breathe.",
  "You stopped where everybody stops. The good part was all the road before it.",
  "You ran until the day ran out. That was the whole job, and you did it.",
];

/** In-voice one-liner picked deterministically per rounded distance: same
 *  kmSurvived (to one decimal) always draws the same line for a given rng
 *  seed, via a fork on `card:${Math.round(kmSurvived*10)}`. */
export function cardLine(rng: Rng, kmSurvived: number): string {
  const cardRng = rng.fork(`card:${Math.round(kmSurvived * 10)}`);
  return cardRng.pick(CARD_LINES);
}

const WOBBLE_FILTER =
  '<filter id="wobble-card"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>';

const PAPER = "#FAF6EC";
const INK = "#26211A";
const PENCIL = "#4E525C";

/** Hand-drawn wobbly rectangle border, inset a few px from the card edge. */
const BORDER_PATH =
  "M 12,10 C 120,6 360,14 468,9 C 474,90 470,210 471,290 C 340,294 140,286 9,291 " +
  "C 6,220 11,110 12,10 Z";

/** A couple of loose doodle strokes in the corners — a small flourish, not a
 *  scene: this is a keepsake card, not another page of the book. */
const DOODLES = [
  // a little upward scribble, bottom-left — the last stride
  `<path d="M28,262 C40,250 48,258 58,246 C66,236 72,244 82,232" fill="none" stroke="${PENCIL}" stroke-width="2" stroke-linecap="round" />`,
  // a soft crescent, top-right — the night that caught up
  `<path d="M420,34 C410,28 402,36 404,46 C406,56 416,60 424,54 C416,54 412,44 420,34 Z" fill="${PENCIL}" opacity="0.55" />`,
];

/** Pure standalone SVG (no foreignObject) rendering the death score card:
 *  480x300, paper background, an inline wobble-filter def scoped to this card
 *  (id "wobble-card", distinct from the book's shared "wobble" filter so the
 *  two never collide when both are present in a page), a hand-drawn border,
 *  the title, the two honest stat lines, the authored poem line, and a couple
 *  of doodle strokes. All data-derived text is esc()'d; colors are literal
 *  light-theme values so the exported PNG reads correctly regardless of the
 *  viewer's theme. */
export function scoreCardSvg(facts: ScoreFacts, line: string): string {
  const outranLine = `you outran The Quiet for ${facts.kmSurvived.toFixed(1)} km`;
  const realLine = `real-you ran ${facts.realKm.toFixed(1)} km that year`;
  const beastLine =
    facts.furthestBeast !== null ? `it got past ${facts.furthestBeast} to catch you` : "";

  return [
    `<svg viewBox="0 0 480 300" width="480" height="300" class="ink-scorecard" xmlns="http://www.w3.org/2000/svg">`,
    `<defs>${WOBBLE_FILTER}</defs>`,
    `<rect x="0" y="0" width="480" height="300" fill="${PAPER}" />`,
    `<path d="${BORDER_PATH}" fill="none" stroke="${INK}" stroke-width="3" filter="url(#wobble-card)" />`,
    `<text x="240" y="52" text-anchor="middle" class="ink-card-title" fill="${INK}">${esc("OUTRUN THE QUIET")}</text>`,
    `<text x="240" y="110" text-anchor="middle" class="ink-card-stat" fill="${INK}">${esc(outranLine)}</text>`,
    `<text x="240" y="140" text-anchor="middle" class="ink-card-stat" fill="${PENCIL}">${esc(realLine)}</text>`,
    beastLine
      ? `<text x="240" y="168" text-anchor="middle" class="ink-card-stat" fill="${PENCIL}">${esc(beastLine)}</text>`
      : "",
    `<text x="240" y="220" text-anchor="middle" class="ink-card-poem" fill="${INK}">${esc(line)}</text>`,
    ...DOODLES,
    `</svg>`,
  ]
    .filter((s) => s.length > 0)
    .join("");
}
