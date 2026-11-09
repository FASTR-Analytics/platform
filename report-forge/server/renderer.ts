// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The PDF printer: hands a complete paged document (built in the browser by
// ui/exports/paged_pdf.ts: theme sheet, figures, inlined fonts, the paged
// stylesheet and the Paged.js runner) to a headless Chrome and returns the
// bytes.
//
// One browser, launched on first use and closed after a quiet spell; one
// render at a time. A report is a few seconds and a few hundred MB of Chrome,
// so renders queue rather than fan out.

import type { Browser } from "@astral/astral";
import { launchChrome, printPagedDocument } from "./paged_chrome.ts";

export type RenderedReportPdf = {
  pdf: Uint8Array;
  // How many pages the document printed to.
  pages: number;
};

export type ReportPdfRenderer = {
  // Print one document. Rejects with a readable reason; the next call starts
  // from a fresh browser.
  render: (
    html: string,
    progress?: (fraction: number, message: string) => Promise<void>,
  ) => Promise<RenderedReportPdf>;
  // Close the browser now (it otherwise closes itself when idle).
  close: () => Promise<void>;
};

// How long a closing browser gets before it is let go: a page stuck in a
// script must not hold the queue through the close as well.
const CLOSE_GRACE_MS = 10_000;

export function createReportPdfRenderer(opts: {
  // The Chrome (or chrome-headless-shell) binary to launch.
  chromePath: string;
  // Give up on a single document after this long, whatever it is stuck on
  // (a script that never yields included). Default 90 s.
  timeoutMs?: number;
  // Close the browser after this long with nothing to print. Default 5 min.
  idleCloseMs?: number;
}): ReportPdfRenderer {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const idleCloseMs = opts.idleCloseMs ?? 5 * 60_000;
  let browser: Browser | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  // The render queue: each render waits for the previous one to settle.
  let queue: Promise<unknown> = Promise.resolve();
  // Renders asked for and not yet settled, the running one included.
  let pending = 0;

  async function getBrowser(): Promise<Browser> {
    browser ??= await launchChrome(opts.chromePath);
    return browser;
  }

  function clearIdleClose(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  }

  async function close(): Promise<void> {
    const b = browser;
    browser = undefined;
    clearIdleClose();
    if (b === undefined) return;
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      b.close().catch(() => {
        // Already gone; nothing to release.
      }),
      new Promise((r) => grace = setTimeout(r, CLOSE_GRACE_MS)),
    ]);
    clearTimeout(grace);
  }

  // Armed only when the queue runs dry, and cleared by the next job to
  // start: a timer left over from the last render must not close the browser
  // under the one printing now.
  function scheduleIdleClose(): void {
    clearIdleClose();
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      void close();
    }, idleCloseMs);
  }

  function render(
    html: string,
    progress?: (fraction: number, message: string) => Promise<void>,
  ): Promise<RenderedReportPdf> {
    pending++;
    const run = queue.then(async () => {
      clearIdleClose();
      try {
        const out = await printPagedDocument(await getBrowser(), html, {
          timeoutMs,
          progress: progress ?? (() => Promise.resolve()),
        });
        return { pdf: out.pdf, pages: out.result.total };
      } catch (e) {
        // Whatever went wrong (a timeout leaves a page stuck in a script),
        // start the next job from a fresh browser.
        await close();
        throw e;
      }
    });
    queue = run.catch(() => undefined).then(() => {
      pending--;
      if (pending === 0 && browser !== undefined) scheduleIdleClose();
    });
    return run;
  }

  return { render, close };
}
