/** Every tag book.ts can emit. Keep in sync with DOODLE map in book.ts. */
export const DOODLE_TAGS = [
  "shoes",
  "empty-shoes",
  "moon",
  "stars",
  "plane",
  "globe",
  "hills",
  "calendar",
  "banana",
  "ghost",
  "trophy",
  "chain",
  "wind",
] as const;

export type DoodleTag = (typeof DOODLE_TAGS)[number];

/** Wraps hand-authored inner markup in the shared doodle <svg> shell.
 *  Extra root attributes (e.g. ghost's opacity) may be passed through. */
function shell(inner: string, extraRootAttrs = ""): string {
  return `<svg viewBox="0 0 120 120" class="ink-doodle" filter="url(#wobble)"${extraRootAttrs ? ` ${extraRootAttrs}` : ""} xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

/** side-view sneaker with a loose, dangling lace */
const SHOES = shell(
  [
    `<path d="M22,92 C20,70 28,52 45,50 C65,48 88,55 100,62 C104,75 98,86 88,90 C60,96 34,98 22,92" fill="none" />`,
    `<path d="M50,55 L60,64 L54,72 L66,80" fill="none" />`,
    `<line x1="22" y1="92" x2="100" y2="88" />`,
  ].join(""),
);

/** a pair of shoes, laces limp, tiny motion-less lines beside them */
const EMPTY_SHOES = shell(
  [
    `<path d="M15,95 C14,80 20,68 32,66 C45,64 58,70 64,76 C66,84 62,90 54,92 C40,96 22,98 15,95" fill="none" />`,
    `<path d="M60,96 C59,82 66,70 78,68 C90,66 102,72 108,78 C110,86 105,92 97,94 C83,98 66,99 60,96" fill="none" />`,
    `<path d="M35,68 L40,74 L37,80" fill="none" />`,
    `<path d="M80,70 L85,76 L82,82" fill="none" />`,
    `<line x1="18" y1="104" x2="29" y2="105" />`,
    `<line x1="72" y1="106" x2="81" y2="105" />`,
  ].join(""),
);

/** a crescent with two small four-point sparks nearby */
const MOON = shell(
  [
    `<path d="M75,25 A38,38 0 1 0 75,95 A30,30 0 1 1 75,25 Z" fill="none" />`,
    `<path d="M18,30 L17,40 M12,34 L23,35" fill="none" />`,
    `<path d="M30,60 L31,67 M26,63 L35,64" fill="none" />`,
  ].join(""),
);

/** 3 four-point sparks of differing size */
const STARS = shell(
  [
    `<path d="M60,20 L58,50 M46,35 L74,37" fill="none" />`,
    `<path d="M30,58 L31,80 M20,69 L41,71" fill="none" />`,
    `<path d="M90,72 L89,86 M83,79 L97,80" fill="none" />`,
  ].join(""),
);

/** paper plane with a loose dotted trail looping behind it */
const PLANE = shell(
  [
    `<path d="M18,62 L102,28 L64,52 L18,62" fill="none" />`,
    `<path d="M64,52 L102,28 L72,88 L64,52" fill="none" />`,
    `<path d="M15,70 C5,85 15,100 30,95 C45,90 40,75 25,78" fill="none" stroke-dasharray="3 4" />`,
  ].join(""),
);

/** globe circle, two graticule arcs, and a tiny flag on top */
const GLOBE = shell(
  [
    `<circle cx="60" cy="60" r="42" class="ink-globe" fill="none" />`,
    `<path d="M60,18 C42,30 42,90 60,102" class="ink-graticule" fill="none" />`,
    `<path d="M18,72 C40,80 80,80 103,68" class="ink-graticule" fill="none" />`,
    `<line x1="61" y1="6" x2="60" y2="26" />`,
    `<path d="M60,7 L75,11 L60,15" fill="none" />`,
  ].join(""),
);

/** two overlapping humps, one carrying a hairline switchback trail */
const HILLS = shell(
  [
    `<path d="M8,95 C25,55 45,50 60,60 C68,66 72,80 75,95" fill="none" />`,
    `<path d="M45,98 C60,70 78,62 95,68 C104,72 108,85 112,98" fill="none" />`,
    `<path d="M55,95 L68,85 L60,78 L80,68" fill="none" />`,
  ].join(""),
);

/** a page with two ring-binder circles and a couple of X'd-out boxes */
const CALENDAR = shell(
  [
    `<path d="M20,15 L100,12 L102,100 L18,98 Z" fill="none" />`,
    `<circle cx="40" cy="13" r="4" fill="none" />`,
    `<circle cx="80" cy="12" r="3.5" fill="none" />`,
    `<path d="M35,50 L45,60 M45,50 L35,60" fill="none" />`,
    `<path d="M65,70 L75,80 M75,70 L65,80" fill="none" />`,
  ].join(""),
);

/** a peeled banana, skin flopped open on both sides */
const BANANA = shell(
  [
    `<path d="M45,100 C35,70 40,40 55,20 C60,15 65,18 63,25 C55,45 52,72 60,98" fill="none" />`,
    `<path d="M45,98 C30,90 20,75 25,55" fill="none" />`,
    `<path d="M60,98 C75,92 85,78 82,58" fill="none" />`,
  ].join(""),
);

/** a wavy-hem sheet ghost with two eyes, slightly transparent */
const GHOST = shell(
  [
    `<path d="M35,100 C30,60 32,30 60,25 C88,30 90,60 85,100 C80,92 75,98 70,100 C65,94 60,100 55,96 C50,102 45,94 40,100 C38,98 36,100 35,100" fill="none" />`,
    `<circle cx="48" cy="55" r="4" />`,
    `<circle cx="72" cy="55" r="3.5" />`,
  ].join(""),
  'opacity=".8"',
);

/** lopsided cup with a single bent handle */
const TROPHY = shell(
  [
    `<path d="M35,18 C33,40 40,58 60,60 C82,57 88,38 85,16" fill="none" />`,
    `<path d="M60,60 C58,70 62,78 57,85" fill="none" />`,
    `<line x1="42" y1="86" x2="76" y2="88" />`,
    `<path d="M85,25 C98,28 100,42 84,46" fill="none" />`,
  ].join(""),
);

/** 3 interlocked oval links */
const CHAIN = shell(
  [
    `<path d="M22,30 C12,32 12,50 24,52 C36,54 38,34 26,31 Z" fill="none" />`,
    `<path d="M45,50 C35,52 35,70 47,72 C59,74 61,54 49,51 Z" fill="none" />`,
    `<path d="M68,70 C58,72 58,90 70,92 C82,94 84,74 72,71 Z" fill="none" />`,
  ].join(""),
);

/** 3 curling speed-lines of differing sweep */
const WIND = shell(
  [
    `<path d="M10,40 C30,30 45,45 65,35" fill="none" />`,
    `<path d="M15,60 C35,50 55,68 78,58" fill="none" />`,
    `<path d="M20,82 C42,72 60,90 85,80" fill="none" />`,
  ].join(""),
);

const DOODLES: Record<DoodleTag, string> = {
  shoes: SHOES,
  "empty-shoes": EMPTY_SHOES,
  moon: MOON,
  stars: STARS,
  plane: PLANE,
  globe: GLOBE,
  hills: HILLS,
  calendar: CALENDAR,
  banana: BANANA,
  ghost: GHOST,
  trophy: TROPHY,
  chain: CHAIN,
  wind: WIND,
};

/** Inline <svg> (viewBox "0 0 120 120", class "ink-doodle", stroke-only
 *  paths, filter="url(#wobble)") or "" for unknown tags. */
export function doodleFor(tag: string): string {
  return (DOODLES as Record<string, string>)[tag] ?? "";
}
