const SVG_NS = "http://www.w3.org/2000/svg";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

/** The token set every rasterized page needs resolved and inlined onto the
 *  clone root — the clone lives outside the live document (inside a data:
 *  URI'd SVG), so it has no access to `:root`'s CSS custom properties;
 *  without this it would render as unstyled black-on-white. Same six
 *  tokens `render/theme.css` defines for both themes. */
const TOKEN_VARS = ["--desk", "--paper", "--ink", "--ink-faint", "--pencil", "--shadow"] as const;

const SHARE_LABEL = "keep this page";
const SHARE_FAIL_LABEL = "this page refused to be kept";
const FAIL_FLASH_MS = 2000;
const RASTER_SCALE = 2;

// ---------------------------------------------------------------------
// Pure helpers (TDD'd in share.test.ts)
// ---------------------------------------------------------------------

/** Maps a `.page`'s `data-page` attribute to its download filename.
 *  `null` (attribute absent) falls back to a generic name; any real string
 *  — including `""` — is used verbatim, since only an absent attribute
 *  means "no page id", not an empty one. */
export function pageFileName(dataPage: string | null): string {
  return dataPage === null ? "inkline-page.png" : `inkline-${dataPage}.png`;
}

/** Wraps `inner` (already-serialized XHTML) in a standalone SVG document
 *  with a single `foreignObject` sized to exactly match the outer `<svg>` —
 *  the shape `new Image()` can decode from a `data:image/svg+xml,` URI.
 *  `inner` passes through completely unescaped/untouched; the caller is
 *  responsible for producing well-formed XHTML (XMLSerializer output). */
export function svgShell(w: number, h: number, inner: string): string {
  return (
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject width="${w}" height="${h}">${inner}</foreignObject>` +
    `</svg>`
  );
}

/** Formats a token map (e.g. `{"--ink": "#26211a"}`) as a `style` attribute
 *  value: `"--ink:#26211a;"`, one declaration per pair, keys sorted so the
 *  output is stable regardless of insertion order (deterministic — matters
 *  because this string ends up inside a serialized clone that's diffed
 *  against nothing, but stability keeps behavior predictable/testable). */
export function inlineTokens(tokens: Record<string, string>): string {
  return Object.keys(tokens)
    .sort()
    .map((key) => `${key}:${tokens[key]};`)
    .join("");
}

// ---------------------------------------------------------------------
// Rasterization glue
// ---------------------------------------------------------------------

function readTokens(el: Element): Record<string, string> {
  const computed = getComputedStyle(el);
  const tokens: Record<string, string> = {};
  for (const name of TOKEN_VARS) {
    tokens[name] = computed.getPropertyValue(name).trim();
  }
  return tokens;
}

/** Concatenates every same-origin stylesheet's rules into one CSS blob, so
 *  the rasterized clone (living outside the real document, inside a data:
 *  URI) still looks like the book. Iterates defensively: a cross-origin
 *  sheet throws on `.cssRules` access, which is expected-benign here (every
 *  stylesheet this app ships is same-origin bundled) — skip it and keep
 *  collecting the rest rather than losing the whole page's styling over
 *  one sheet. */
function collectStylesheetText(): string {
  let css = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        css += rule.cssText;
      }
    } catch {
      // Cross-origin (or otherwise inaccessible) stylesheet — expected to
      // happen occasionally in browsers with strict CORS on <link> sheets;
      // none of ours are cross-origin, so this is belt-and-suspenders.
      continue;
    }
  }
  return css;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("share: image failed to decode from serialized page svg"));
    img.src = src;
  });
}

/** The full "keep this page" pipeline: clone `section`, inline its resolved
 *  token colors + every bundled stylesheet's rules onto/around the clone,
 *  serialize it as XHTML, wrap it in an SVG `foreignObject`, decode that as
 *  an `Image`, draw it to a 2x canvas, and resolve a PNG `Blob`. Any step
 *  failing (tainted canvas, image decode failure, missing 2d context)
 *  rejects with a real `Error` for the caller to log and recover from. */
async function rasterizeSection(section: HTMLElement): Promise<Blob> {
  const rect = section.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));

  const clone = section.cloneNode(true) as HTMLElement;
  clone.querySelector(".share-btn")?.remove();
  const tokenStyle = inlineTokens(readTokens(section));
  const existingStyle = clone.getAttribute("style") ?? "";
  clone.setAttribute("style", `${tokenStyle}${existingStyle}`);
  // XHTML namespace on the clone root — required for XMLSerializer to
  // produce well-formed markup a foreignObject will actually render.
  clone.setAttribute("xmlns", XHTML_NS);

  const css = collectStylesheetText();
  const serialized = new XMLSerializer().serializeToString(clone);
  const inner = `<style>${css}</style>${serialized}`;
  const svg = svgShell(w, h, inner);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = w * RASTER_SCALE;
  canvas.height = h * RASTER_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share: 2d canvas context unavailable");
  ctx.scale(RASTER_SCALE, RASTER_SCALE);
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("share: canvas.toBlob produced no blob (likely a tainted canvas)"));
    }, "image/png");
  });
}

function createShareButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "share-btn no-print";
  btn.textContent = SHARE_LABEL;
  return btn;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Installs a "keep this page" button (bottom-right, `.share-btn no-print`)
 *  onto every `.page` under `root`. Purely functional chrome — no
 *  animation — so it installs identically under `prefers-reduced-motion`;
 *  the caller (index.ts) never gates this behind that check. On click,
 *  rasterizes that one page to a PNG and downloads it; on failure, flips
 *  the button's own label to an in-voice apology for 2s and logs the real
 *  error to the console (never a silent swallow). Returns a teardown that
 *  removes every button, clears any in-flight fail-flash timers, and drops
 *  the click listeners. */
export function initShare(root: ParentNode): () => void {
  const sections = Array.from(root.querySelectorAll<HTMLElement>(".page"));
  const timers = new Set<number>();
  const cleanups: Array<() => void> = [];

  for (const section of sections) {
    const btn = createShareButton();

    const onClick = (): void => {
      void rasterizeSection(section)
        .then((blob) => {
          triggerDownload(blob, pageFileName(section.getAttribute("data-page")));
        })
        .catch((err) => {
          console.error(err);
          btn.textContent = SHARE_FAIL_LABEL;
          const timer = window.setTimeout(() => {
            btn.textContent = SHARE_LABEL;
            timers.delete(timer);
          }, FAIL_FLASH_MS);
          timers.add(timer);
        });
    };

    btn.addEventListener("click", onClick);
    section.appendChild(btn);

    cleanups.push(() => {
      btn.removeEventListener("click", onClick);
      btn.remove();
    });
  }

  return (): void => {
    for (const timer of timers) window.clearTimeout(timer);
    timers.clear();
    for (const cleanup of cleanups) cleanup();
  };
}
