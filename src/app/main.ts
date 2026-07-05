import "../render/theme.css";
import "./shell.css";

import { readExportZip, buildYear } from "../ingest";
import type { RawExport, Year } from "../ingest";
import { analyzeYear } from "../analyze";
import { buildBook } from "../storytell";
import { renderBook, esc, doodleFor } from "../render";
import { makeSyntheticYear } from "../fixtures/synthetic";
import { routeFiles, gpxToRaw } from "./files";
import { rejectionPage, brokenZipPage, stuckPage } from "./errors";
import { initLivingBook } from "../living";
import type { LivingBookHandle } from "../living";

// ---------------------------------------------------------------------
// Root + small shared state
// ---------------------------------------------------------------------

const app = document.getElementById("app")!;

/** Pages currently on the book screen, in document order, for keyboard nav. */
let pageEls: HTMLElement[] = [];
let pageIndex = 0;

/** Teardown for the currently-active living-book layer (self-drawing ink +
 *  runner), if any. Non-null only while a book is on screen. */
let livingBookHandle: LivingBookHandle | null = null;

function paint(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

// ---------------------------------------------------------------------
// Theme: auto -> light -> dark, persisted, applied on load
// ---------------------------------------------------------------------

type Theme = "auto" | "light" | "dark";
const THEME_KEY = "inkline-theme";
const THEME_CYCLE: readonly Theme[] = ["auto", "light", "dark"];

function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "auto";
}

function applyTheme(theme: Theme): void {
  if (theme === "auto") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function nextTheme(theme: Theme): Theme {
  const idx = THEME_CYCLE.indexOf(theme);
  return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!;
}

// ---------------------------------------------------------------------
// Title tilt-span helper (mirrors render/pages.ts's letter-tilt aesthetic)
// ---------------------------------------------------------------------

const TILT_CLASSES = ["tilt-a", "tilt-b", "tilt-c"] as const;

function tiltSpan(text: string): string {
  let out = "";
  let i = 0;
  for (const ch of text) {
    if (ch === " ") {
      out += " ";
      continue;
    }
    out += `<span class="${TILT_CLASSES[i % 3]!}">${esc(ch)}</span>`;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------

function renderCover(): void {
  pageEls = [];
  pageIndex = 0;

  const doodle = doodleFor("shoes");

  app.innerHTML = [
    `<div class="map-area cover-wrap">`,
    `<section class="page cover-card drop-zone" id="drop-zone">`,
    `<h1 class="chapter-title cover-title">${tiltSpan("Inkline")}</h1>`,
    `<p class="verse cover-tagline">drop your Apple Health export — get the storybook of your running year</p>`,
    `<div class="cover-doodle" aria-hidden="true">${doodle}</div>`,
    `<p class="drop-zone-hint">drag your export here</p>`,
    `<button type="button" class="choose-file-btn" id="choose-file-btn">choose a file</button>`,
    `<input type="file" id="file-input" hidden multiple accept=".zip,.gpx" />`,
    `<a href="#" id="demo-link" class="demo-link">or read the demo book</a>`,
    `<p class="privacy-line">everything happens in this tab; your data never leaves it</p>`,
    `</section>`,
    `</div>`,
  ].join("");

  const dropZone = document.getElementById("drop-zone")!;
  const fileInput = document.getElementById("file-input") as HTMLInputElement;
  const chooseBtn = document.getElementById("choose-file-btn")!;
  const demoLink = document.getElementById("demo-link")!;

  chooseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    void handleFiles(Array.from(fileInput.files ?? []));
  });

  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    void handleFiles(Array.from(e.dataTransfer?.files ?? []));
  });

  demoLink.addEventListener("click", (e) => {
    e.preventDefault();
    void runDemo();
  });
}

function renderProgress(message: string): void {
  pageEls = [];
  pageIndex = 0;
  app.innerHTML = [
    `<div class="map-area progress-wrap">`,
    `<section class="page progress-card">`,
    `<p class="verse progress-message">${esc(message)}</p>`,
    `</section>`,
    `</div>`,
  ].join("");
}

function showError(sectionHtml: string): void {
  pageEls = [];
  pageIndex = 0;
  app.innerHTML = [
    `<div class="map-area error-wrap">`,
    sectionHtml,
    `<button type="button" class="start-over-btn" id="error-start-over">start over</button>`,
    `</div>`,
  ].join("");
  document.getElementById("error-start-over")!.addEventListener("click", () => startOver());
}

function showBook(bookHtml: string): void {
  app.innerHTML = [
    `<div class="toolbar no-print">`,
    `<button type="button" class="theme-toggle" id="theme-toggle"></button>`,
    `<button type="button" class="print-btn" id="print-btn">print</button>`,
    `<button type="button" class="start-over-btn" id="start-over-btn">start over</button>`,
    `</div>`,
    `<main class="book">${bookHtml}</main>`,
  ].join("");

  setupToolbar();
  pageEls = Array.from(document.querySelectorAll<HTMLElement>(".book .page"));
  pageIndex = 0;

  livingBookHandle?.teardown();
  const bookRoot = document.querySelector<HTMLElement>(".book")!;
  livingBookHandle = initLivingBook(bookRoot);
}

/** Tears down the living-book layer (if any) and returns to the cover — the
 *  one choke point every "start over" affordance routes through. */
function startOver(): void {
  livingBookHandle?.teardown();
  livingBookHandle = null;
  renderCover();
}

function setupToolbar(): void {
  const themeBtn = document.getElementById("theme-toggle") as HTMLButtonElement;
  let theme = loadTheme();

  const renderLabel = () => {
    themeBtn.textContent = `theme: ${theme}`;
  };
  renderLabel();

  themeBtn.addEventListener("click", () => {
    theme = nextTheme(theme);
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    renderLabel();
  });

  document.getElementById("print-btn")!.addEventListener("click", () => window.print());
  document.getElementById("start-over-btn")!.addEventListener("click", () => startOver());
}

function goToPage(delta: number): void {
  if (pageEls.length === 0) return;
  const next = pageIndex + delta;
  if (next < 0 || next >= pageEls.length) return; // no wrap
  pageIndex = next;
  pageEls[pageIndex]!.scrollIntoView({ behavior: "smooth" });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") goToPage(1);
  else if (e.key === "ArrowLeft") goToPage(-1);
});

// ---------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------

/** Shared tail of the pipeline: a Year in hand, run analyze -> storytell ->
 *  render. Used by both the ingest path and the demo path ("sans ingest"). */
async function processYear(year: Year): Promise<void> {
  let stage = "noticing things";
  try {
    const withMaps = year.runs.filter((r) => r.track && r.track.length > 0).length;
    renderProgress(`${year.runs.length} runs, ${withMaps} with maps`);
    await paint();

    renderProgress("noticing things…");
    await paint();
    const story = analyzeYear(year);

    stage = "writing the book";
    renderProgress("writing the book…");
    await paint();
    const book = buildBook(year, story);

    stage = "inking the pages";
    renderProgress("inking the pages…");
    await paint();
    const html = renderBook(book, year);

    showBook(html);
  } catch (err) {
    console.error(err);
    showError(stuckPage(stage));
  }
}

async function runFromRaw(raw: RawExport): Promise<void> {
  const stage = "reading your year";
  try {
    renderProgress("reading your year…");
    await paint();
    const year = buildYear(raw);
    await processYear(year);
  } catch (err) {
    console.error(err);
    showError(stuckPage(stage));
  }
}

async function runZip(file: File): Promise<void> {
  renderProgress("unlacing the zip…");
  await paint();

  let raw: RawExport;
  try {
    const buf = await file.arrayBuffer();
    raw = await readExportZip(new Uint8Array(buf));
  } catch (err) {
    console.error(err);
    showError(brokenZipPage());
    return;
  }

  const msg = raw.exportXml
    ? `found ${raw.gpxFiles.size} routes and an index of everything`
    : `found ${raw.gpxFiles.size} routes, no index — routes will do`;
  renderProgress(msg);
  await paint();

  await runFromRaw(raw);
}

async function runGpx(files: File[]): Promise<void> {
  renderProgress("gathering your routes…");
  await paint();

  let raw: RawExport;
  try {
    raw = await gpxToRaw(files);
  } catch (err) {
    console.error(err);
    showError(stuckPage("gathering your routes"));
    return;
  }

  renderProgress(`found ${raw.gpxFiles.size} routes, no index — routes will do`);
  await paint();

  await runFromRaw(raw);
}

async function handleFiles(files: File[]): Promise<void> {
  if (files.length === 0) {
    showError(rejectionPage());
    return;
  }
  const route = routeFiles(files);
  if (route.kind === "zip") {
    await runZip(route.file);
  } else if (route.kind === "gpx") {
    await runGpx(route.files);
  } else {
    showError(rejectionPage());
  }
}

async function runDemo(): Promise<void> {
  renderProgress("opening the demo book…");
  await paint();
  const year = makeSyntheticYear();
  await processYear(year);
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

applyTheme(loadTheme());
renderCover();
