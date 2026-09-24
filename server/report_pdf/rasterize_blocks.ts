// =============================================================================
// Block rasters for the Word export (lib/report_fastr_word.ts). The client
// sends the same standalone document the PDF prints, laid out at the print
// column's width by buildFastrWordRasterCss, and the fence lines of the
// decorative blocks (cover, band, tiles, card, stat). For each block Chrome
// measures every text element (fastrWordMeasureJs), hides the glyphs, and
// screenshots the block at 2x; the document then carries the picture with an
// editable text box over each measured element.
//
// No instance state and no env here: the page is the caller's (the route's
// entry, rasterizeReportBlocks in render_report_pdf.ts, takes one on the
// PDF's shared browser), so the raster test drives rasterizeBlocksOnPage
// directly.
// =============================================================================

import type { Page } from "@astral/astral";
import { encodeBase64 } from "@std/encoding/base64";
import {
  FASTR_WORD_HIDE_CLASS,
  type FastrWordRasterBlock,
  type FastrWordRasterKind,
  type FastrWordRasterMeta,
  fastrWordBlockSelector,
  fastrWordMeasureJs,
} from "lib";

const POLL_MS = 100;
const READY_GLOBAL = "__fmWordReady";
// The launch window (paged_chrome.ts); a block taller than it needs a taller
// viewport, or the element screenshot captures only what the viewport holds.
const VIEWPORT = { width: 1600, height: 1800 };

export type RasterBlockRequest = { id: number; kind: FastrWordRasterKind };

export type RasterizeOptions = {
  timeoutMs: number;
  progress?: (pct: number, message: string) => Promise<void>;
};

// Everything the pictures depend on: the load, a layout so the text asks for
// its faces, then the faces and the images (the same three steps as the paged
// runner's ready()). Published on a global and polled, so a slow document
// fails with a reason rather than hanging.
const READY_JS = `(function () {
  var G = ${JSON.stringify(READY_GLOBAL)};
  function done() { window[G] = "ready"; }
  function fail(e) { window[G] = "error: " + String(e && e.message ? e.message : e); }
  var loaded = document.readyState === "complete"
    ? Promise.resolve()
    : new Promise(function (res) { window.addEventListener("load", function () { res(); }, { once: true }); });
  loaded.then(function () {
    void document.body.offsetHeight;
    var imgs = Array.prototype.slice.call(document.images);
    var decodes = imgs.map(function (img) {
      return img.decode ? img.decode().catch(function () {}) : Promise.resolve();
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    return Promise.all(decodes.concat([fonts]));
  }).then(done).catch(fail);
})()`;

async function waitReady(page: Page, timeoutMs: number): Promise<void> {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(`window[${JSON.stringify(READY_GLOBAL)}]`) as string | undefined;
    if (state === "ready") return;
    if (state !== undefined && state.startsWith("error")) {
      throw new Error(`The document did not load: ${state}`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out loading the document for its block pictures.");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function toggleHideJs(id: number, on: boolean): string {
  return `(function () {
  var el = document.querySelector(${JSON.stringify(fastrWordBlockSelector(id))});
  if (el) el.classList.${on ? "add" : "remove"}(${JSON.stringify(FASTR_WORD_HIDE_CLASS)});
})()`;
}

export async function rasterizeBlocksOnPage(
  page: Page,
  html: string,
  blocks: readonly RasterBlockRequest[],
  opts: RasterizeOptions,
): Promise<FastrWordRasterBlock[]> {
  await opts.progress?.(0.1, "Loading the document");
  await page.setContent(html);
  await page.evaluate(READY_JS);
  await waitReady(page, opts.timeoutMs);

  // Measure first: the tallest block sets the viewport once, before any
  // screenshot, and a missing block fails before any work is done.
  const measure = fastrWordMeasureJs();
  const metas: (FastrWordRasterMeta)[] = [];
  for (const b of blocks) {
    const meta = await page.evaluate(`${measure}(${b.id})`) as
      | Omit<FastrWordRasterMeta, "kind">
      | null;
    if (meta === null) {
      throw new Error(`The ${b.kind} block at line ${b.id + 1} was not found in the document.`);
    }
    metas.push({ ...meta, kind: b.kind });
  }
  const tallest = Math.max(0, ...metas.map((m) => m.heightPx));
  if (tallest + 40 > VIEWPORT.height) {
    await page.setViewportSize({ width: VIEWPORT.width, height: Math.ceil(tallest) + 40 });
  }

  const out: FastrWordRasterBlock[] = [];
  for (let i = 0; i < metas.length; i++) {
    const meta = metas[i];
    await opts.progress?.(0.2 + 0.75 * (i / Math.max(1, metas.length)), "Picturing the design blocks");
    const el = await page.$(fastrWordBlockSelector(meta.id));
    if (el === null) {
      throw new Error(`The ${meta.kind} block at line ${meta.id + 1} was not found in the document.`);
    }
    await page.evaluate(toggleHideJs(meta.id, true));
    let png: Uint8Array;
    try {
      png = await el.screenshot({ format: "png", scale: 2 });
    } finally {
      await page.evaluate(toggleHideJs(meta.id, false));
    }
    out.push({ ...meta, png: encodeBase64(png) });
  }
  return out;
}
