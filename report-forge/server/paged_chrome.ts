// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Headless Chrome, driven over CDP (astral): load a paged report document,
// wait for its Paged.js runner (report-forge/engine/report_fastr_paged.ts) to publish where
// the pages fell, print to PDF. No instance state here — the browser and the
// path are the caller's — so the render tests can drive it directly.
// =============================================================================

import { type Browser, launch, type Page } from "@astral/astral";
import {
  FASTR_PAGED_GLOBAL,
  type FastrPagedResult,
} from "../engine/report_fastr_paged.ts";

const POLL_MS = 150;

// A proxy address nothing answers on: the discard port, on loopback.
const DEAD_PROXY = "http://127.0.0.1:9";

// The one network origin a printed document may still need: the theme's
// Google Fonts @import, which the browser leaves in place when it could not
// inline the faces itself (ui/exports/inline_theme_fonts.ts falls back to
// it). Everything else in the document is a data: or blob: URL.
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

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
      // The printed html is the caller's, and this Chrome sits inside the
      // host's network: no request may leave it (blockNetwork, per page).
      // Request interception does not see WebSockets or workers' own
      // traffic, so every connection is also sent to a proxy that is not
      // there, loopback included (Chrome bypasses a proxy for loopback by
      // default); only the font hosts go direct. WebRTC may not route
      // around the proxy.
      `--proxy-server=${DEAD_PROXY}`,
      `--proxy-bypass-list=<-loopback>;${FONT_HOSTS.join(";")}`,
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });
}

// Whether the printed page may fetch `url`.
export function isPrintRequestAllowed(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "data:" || u.protocol === "blob:") return true;
  if (u.protocol === "about:") return true;
  return u.protocol === "https:" && u.port === "" &&
    FONT_HOSTS.includes(u.hostname);
}

// Fail every request the page makes that isPrintRequestAllowed refuses: an
// internal address fetched from the document would otherwise be printed
// into the PDF the caller gets back.
async function blockNetwork(page: Page): Promise<void> {
  const cdp = page.unsafelyGetCelestialBindings();
  cdp.addEventListener("Fetch.requestPaused", (e) => {
    const { requestId, request } = e.detail;
    const reply = isPrintRequestAllowed(request.url)
      ? cdp.Fetch.continueRequest({ requestId })
      : cdp.Fetch.failRequest({ requestId, errorReason: "BlockedByClient" });
    // The page may be gone by now; there is nobody left to answer.
    reply.catch(() => undefined);
  });
  await cdp.Fetch.enable({ patterns: [{ urlPattern: "*" }] });
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
  until: number,
): Promise<FastrPagedResult> {
  for (;;) {
    const result = await page.evaluate(
      (g: string) =>
        (globalThis as unknown as Record<string, FastrPagedResult | undefined>)[
          g
        ],
      { args: [FASTR_PAGED_GLOBAL] },
    );
    if (result !== undefined) return result;
    if (Date.now() > until) {
      throw new Error("Timed out laying out the report pages.");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export const PRINT_TIMEOUT_MESSAGE = "Timed out printing the report.";

// `timeoutMs` bounds the whole print, not only the layout: a document that
// never yields (a script that loops) blocks setContent itself, and every
// CDP call after it, for good. On expiry this rejects at once and leaves the
// stuck page behind; the browser it runs in is no longer usable, and the
// caller closes it (createReportPdfRenderer does).
export async function printPagedDocument(
  browser: Browser,
  html: string,
  opts: PagedRenderOptions,
): Promise<PagedRender> {
  const started = Date.now();
  let page: Page | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(PRINT_TIMEOUT_MESSAGE));
    }, opts.timeoutMs);
  });
  const work = (async (): Promise<PagedRender> => {
    page = await browser.newPage();
    await blockNetwork(page);
    await opts.progress?.(0.1, "Loading the document");
    await page.setContent(html);
    await opts.progress?.(0.3, "Laying out pages");
    // A little short of the whole budget, so a runner that never answers
    // reports the layout timeout rather than the bare one.
    const result = await waitForPagination(
      page,
      started + Math.max(0, opts.timeoutMs - 4 * POLL_MS),
    );
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
  })();
  // Settles after the race when a step was stuck; nobody waits on it.
  work.catch(() => undefined);
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
    // A stuck page may never answer a close: not waited on after a timeout.
    const closing = (page as Page | undefined)?.close().catch(() => {
      // The page dying is the browser dying; the caller relaunches next time.
    });
    if (!timedOut) await closing;
  }
}
