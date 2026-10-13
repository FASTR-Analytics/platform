// The editor's paginator: lays the current document out as printed pages in
// a hidden frame, with the SAME paged document the PDF is printed from
// (buildStandaloneReportHtml + Paged.js), and hands back where each page
// starts, in source lines. Runs after a typing pause, one layout at a time; a
// request arriving mid-layout queues one more run rather than a pile-up.
//
// Layout-only on purpose: figures and images are transparent boxes at the
// size the PDF will give them (the host's size caches: a figure's raster box,
// an image's natural size), so a run is a layout pass in an iframe (hundreds
// of milliseconds for a long report), never a rasterization. Sizes come from
// caches, never from the editor's DOM, so a result does not depend on what
// happened to be scrolled into view when it ran.

import {
  FASTR_PAGED_GLOBAL,
  type FastrPagedFooter,
  type FastrPagedResult,
} from "../engine/report_fastr_paged.ts";
import {
  buildStandaloneReportHtml,
  type ReportDocument,
} from "./exports/standalone_html.ts";

export type ReportPaginatorDeps = {
  // The document as it stands; undefined while there is nothing to lay out.
  document: () => ReportDocument | undefined;
  footer: () => FastrPagedFooter;
  figureSize: (id: string) => { width: number; height: number } | undefined;
  imageSize: (id: string) => { width: number; height: number } | undefined;
  // The result, with the body it was laid out from (the editor may have
  // moved on during the layout).
  onResult: (result: FastrPagedResult | undefined, body: string) => void;
};

export type ReportPaginator = {
  // Schedule a run after the debounce window (coalescing repeated calls).
  request: () => void;
  // Run now (a theme or page-size change, where the user is waiting on it).
  requestNow: () => void;
  dispose: () => void;
};

// Short: the editor flows blocks between pages itself as they overflow
// (live_preview_extension's pageBoxPlugin); this run confirms the breaks.
const DEBOUNCE_MS = 400;
const LAYOUT_TIMEOUT_MS = 20_000;
const POLL_MS = 80;

export function createReportPaginator(
  deps: ReportPaginatorDeps,
): ReportPaginator {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let disposed = false;
  let frame: HTMLIFrameElement | undefined;

  function schedule(delay: number) {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  }

  async function run(): Promise<void> {
    if (disposed) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const doc = deps.document();
      if (doc === undefined) {
        deps.onResult(undefined, "");
        return;
      }
      // Layout only: no figure is drawn and no image fetched, so the host
      // half of an export is never asked for.
      const html = await buildStandaloneReportHtml(
        doc,
        {
          assetUrl: (f) => f,
        },
        () => {},
        {
          paged: { footer: deps.footer() },
          layoutOnly: {
            figureSize: deps.figureSize,
            imageSize: deps.imageSize,
          },
        },
      );
      if (disposed) return;
      const result = await layoutInFrame(html);
      if (disposed) return;
      deps.onResult(result, doc.body);
    } catch (e) {
      console.warn("Report pagination failed", e);
      if (!disposed) deps.onResult(undefined, "");
    } finally {
      running = false;
      if (queued && !disposed) {
        queued = false;
        schedule(0);
      }
    }
  }

  function layoutInFrame(html: string): Promise<FastrPagedResult> {
    frame?.remove();
    const f = document.createElement("iframe");
    frame = f;
    // Scripts must run (the polyfill and the runner); same-origin so the
    // result can be read back. The frame is wide enough that no responsive
    // rule collapses a grid: the sheet is Paged.js's box, not the viewport.
    f.setAttribute("sandbox", "allow-same-origin allow-scripts");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText =
      "position:fixed;left:-30000px;top:0;width:1400px;height:1000px;border:0;visibility:hidden;pointer-events:none;";
    document.body.append(f);
    return new Promise<FastrPagedResult>((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        if (frame !== f) {
          reject(new Error("superseded"));
          return;
        }
        const win = f.contentWindow as
          | (Window & Record<string, FastrPagedResult | undefined>)
          | null;
        const result = win?.[FASTR_PAGED_GLOBAL];
        if (result !== undefined) {
          f.remove();
          if (frame === f) frame = undefined;
          if (result.error !== undefined) reject(new Error(result.error));
          else resolve(result);
          return;
        }
        if (Date.now() - started > LAYOUT_TIMEOUT_MS) {
          f.remove();
          if (frame === f) frame = undefined;
          reject(new Error("timed out"));
          return;
        }
        setTimeout(poll, POLL_MS);
      };
      f.addEventListener("load", () => setTimeout(poll, POLL_MS), {
        once: true,
      });
      f.srcdoc = html;
    });
  }

  return {
    request: () => schedule(DEBOUNCE_MS),
    requestNow: () => schedule(0),
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      frame?.remove();
      frame = undefined;
    },
  };
}
