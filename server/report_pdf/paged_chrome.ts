// =============================================================================
// Headless Chrome, driven over CDP (astral): load a paged report document,
// wait for its Paged.js runner (lib/report_fastr_paged.ts) to publish where
// the pages fell, print to PDF. No instance state here — the browser and the
// path are the caller's — so the render tests can drive it directly.
// =============================================================================

import { type Browser, launch, type Page } from "@astral/astral";
import { FASTR_PAGED_GLOBAL, type FastrPagedResult } from "lib";

const POLL_MS = 150;

export function launchChrome(path: string): Promise<Browser> {
  return launch({
    path,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--font-render-hinting=none",
      // Taller than any sheet: the responsive rules must not fire, and an
      // element screenshot (the tests) captures only what the viewport holds.
      "--window-size=1600,1800",
    ],
  });
}

export type PagedRender = {
  pdf: Uint8Array;
  result: FastrPagedResult;
};

export type PagedRenderOptions = {
  timeoutMs: number;
  progress?: (pct: number, message: string) => Promise<void>;
  // Runs against the laid-out page before printing (the tests assert on the
  // Paged.js DOM and take screenshots here).
  inspect?: (page: Page, result: FastrPagedResult) => Promise<void>;
};

// Poll for the runner's result: a fast document returns fast, a stuck one
// fails with the runner's own reason rather than a bare timeout.
async function waitForPagination(
  page: Page,
  timeoutMs: number,
): Promise<FastrPagedResult> {
  const started = Date.now();
  for (;;) {
    const result = await page.evaluate(
      (g: string) =>
        (globalThis as unknown as Record<string, FastrPagedResult | undefined>)[g],
      { args: [FASTR_PAGED_GLOBAL] },
    );
    if (result !== undefined) return result;
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out laying out the report pages.");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export async function printPagedDocument(
  browser: Browser,
  html: string,
  opts: PagedRenderOptions,
): Promise<PagedRender> {
  const page = await browser.newPage();
  try {
    await opts.progress?.(0.1, "Loading the document");
    await page.setContent(html);
    await opts.progress?.(0.3, "Laying out pages");
    const result = await waitForPagination(page, opts.timeoutMs);
    if (result.error !== undefined) {
      throw new Error(`Page layout failed: ${result.error}`);
    }
    if (result.total === 0) {
      throw new Error("The report laid out to no pages.");
    }
    if (opts.inspect) await opts.inspect(page, result);
    await opts.progress?.(0.7, "Printing");
    // preferCSSPageSize: the sheet is the @page size Paged.js wrote; every
    // .pagedjs_page box breaks onto its own sheet under Paged.js's own print
    // rules. printBackground: grounds, tones and bands are backgrounds.
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    });
    return { pdf, result };
  } finally {
    try {
      await page.close();
    } catch {
      // The page dying is the browser dying; the caller relaunches next time.
    }
  }
}
