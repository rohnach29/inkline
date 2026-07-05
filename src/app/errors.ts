import { esc } from "../render";

/** Pure, authored, in-voice error pages. Never a raw error message —
 *  the real one goes to console.error; the reader gets verse. */

const REJECTION_QUATRAIN = [
  "This isn't quite the shape of a running year —",
  "no laces here, no miles, no map to steer.",
  "Somewhere in your phone, the real one waits:",
  "a zipped-up file of your logged-in dates.",
] as const;

const REJECTION_STEPS = [
  "Open the Health app on your iPhone.",
  "Tap your profile picture, top right.",
  "Scroll down and tap \"Export All Health Data\".",
  "Drop the zip it hands you back here.",
] as const;

/** not-a-health-export: quatrain + numbered how-to-export steps. */
export function rejectionPage(): string {
  const verse = REJECTION_QUATRAIN.map((l) => `<div class="verse">${esc(l)}</div>`).join("");
  const steps = REJECTION_STEPS.map((l) => `<li>${esc(l)}</li>`).join("");
  return [
    `<section class="page page-rejection" data-page="rejection">`,
    `<div class="kicker">not quite the right file</div>`,
    `<h2 class="chapter-title">Wrong Shoes, Wrong Door</h2>`,
    verse,
    `<ol class="steps">${steps}</ol>`,
    `</section>`,
  ].join("");
}

const BROKEN_ZIP_COUPLET = [
  "The zip came apart before it reached the page —",
  "a torn seam, a stitch dropped somewhere in transit.",
] as const;

/** unreadable zip: in-voice couplet + "try re-exporting" line. */
export function brokenZipPage(): string {
  const verse = BROKEN_ZIP_COUPLET.map((l) => `<div class="verse">${esc(l)}</div>`).join("");
  return [
    `<section class="page page-broken-zip" data-page="broken-zip">`,
    `<div class="kicker">the seam gave out</div>`,
    `<h2 class="chapter-title">Torn At The Seam</h2>`,
    verse,
    `<p class="verse">Try re-exporting from the Health app and dropping the fresh copy here.</p>`,
    `</section>`,
  ].join("");
}

/** any downstream throw, mid-pipeline: rejectionPage() variant naming the
 *  stage that got stuck, in-voice. Used by main.ts's stage error handling —
 *  never prints the raw error, which is logged separately via console.error. */
export function stuckPage(stage: string): string {
  return [
    `<section class="page page-stuck" data-page="stuck">`,
    `<div class="kicker">a snag in the thread</div>`,
    `<h2 class="chapter-title">The Book Got Stuck</h2>`,
    `<div class="verse">The book got stuck at the ${esc(stage)} —</div>`,
    `<div class="verse">try again, or export fresh.</div>`,
    `</section>`,
  ].join("");
}
