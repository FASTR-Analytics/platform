// =============================================================================
// Paged report PDF: prints a complete, self-contained report document with
// headless Chrome. The document arrives from the CLIENT already laid out for
// paper — theme sheet, rasters, inlined fonts, the paged stylesheet and the
// Paged.js runner (lib/report_fastr_paged.ts) — so this module's whole job is
// to hand it to Chrome (paged_chrome.ts) and return the bytes.
//
// One browser, launched on first use and closed after a quiet spell; one
// render at a time. A report is a few seconds and a few hundred MB of Chrome,
// and the instance hosts are small, so renders queue rather than fan out. The
// Word export's block rasterizer (rasterize_blocks.ts) shares the browser and
// the queue through withReportBrowser.
// =============================================================================

import type { Browser } from "@astral/astral";
import type { APIResponseWithData, FastrWordRasterBlock } from "lib";
import { _CHROME_PATH } from "../exposed_env_vars.ts";
import { launchChrome, printPagedDocument } from "./paged_chrome.ts";
import { type RasterBlockRequest, rasterizeBlocksOnPage } from "./rasterize_blocks.ts";

export const RENDER_TIMEOUT_MS = 90_000;
const IDLE_CLOSE_MS = 5 * 60_000;

export type RenderedReportPdf = {
  pdf: Uint8Array;
  pages: number;
};

let browser: Browser | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
// The render queue: each render waits for the previous one to settle.
let queue: Promise<unknown> = Promise.resolve();

async function getBrowser(): Promise<Browser> {
  if (browser !== undefined) return browser;
  if (_CHROME_PATH === undefined || _CHROME_PATH.length === 0) {
    throw new Error(
      "This instance cannot render PDFs: CHROME_PATH is not configured.",
    );
  }
  browser = await launchChrome(_CHROME_PATH);
  return browser;
}

async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = undefined;
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  try {
    await b?.close();
  } catch {
    // Already gone; nothing to release.
  }
}

function scheduleIdleClose(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    void closeBrowser();
  }, IDLE_CLOSE_MS);
}

// Run one job against the shared browser. Serialized; a browser crash is
// recovered by relaunching on the next call. `what` names the job in the
// error a caller shows ("rendering the report PDF").
export function withReportBrowser<T>(
  what: string,
  fn: (browser: Browser) => Promise<T>,
): Promise<APIResponseWithData<T>> {
  const run = queue.then(async (): Promise<APIResponseWithData<T>> => {
    try {
      const b = await getBrowser();
      const data = await fn(b);
      scheduleIdleClose();
      return { success: true, data };
    } catch (e) {
      // Whatever went wrong, start the next job from a fresh browser.
      await closeBrowser();
      return {
        success: false,
        err: `Error ${what}: ` + (e instanceof Error ? e.message : String(e)),
      };
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

// Render one document to a PDF.
export function renderReportPdf(
  html: string,
  progress: (pct: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<RenderedReportPdf>> {
  return withReportBrowser("rendering the report PDF", async (b) => {
    const out = await printPagedDocument(b, html, {
      timeoutMs: RENDER_TIMEOUT_MS,
      progress,
    });
    return { pdf: out.pdf, pages: out.result.total };
  });
}

// Picture the decorative blocks of a report for the Word export: a fresh page
// on the shared browser, closed whatever happens.
export function rasterizeReportBlocks(
  html: string,
  blocks: readonly RasterBlockRequest[],
  progress: (pct: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<FastrWordRasterBlock[]>> {
  return withReportBrowser("picturing the report's design blocks", async (b) => {
    const page = await b.newPage();
    try {
      return await rasterizeBlocksOnPage(page, html, blocks, {
        timeoutMs: RENDER_TIMEOUT_MS,
        progress,
      });
    } finally {
      try {
        await page.close();
      } catch {
        // The page dying is the browser dying; the caller relaunches next time.
      }
    }
  });
}

// Whether this instance can render at all — the client shows a plain message
// instead of a failed progress bar when it cannot.
export function canRenderReportPdf(): boolean {
  return _CHROME_PATH !== undefined && _CHROME_PATH.length > 0;
}
