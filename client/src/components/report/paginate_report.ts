// The editor's paginator: lays the current document out as printed pages in
// a hidden frame — with the SAME paged document the server prints
// (buildStandaloneReportHtml + Paged.js) — and hands back where each page
// starts, in source lines. Runs after a typing pause, one layout at a time; a
// request arriving mid-layout queues one more run rather than a pile-up.
//
// Layout-only on purpose: figures and images are transparent boxes at the
// size the live editor already shows them, so a run is a layout pass in an
// iframe (hundreds of milliseconds for a long report), never a rasterization.

import {
  FASTR_PAGED_GLOBAL,
  type FastrPagedFooter,
  type FastrPagedResult,
  type ReportDetail,
} from "lib";
import { buildStandaloneReportHtml } from "~/exports/export_report_as_html";

export type ReportPaginatorDeps = {
  // The document as it stands: body from the editor, the rest from the host.
  detail: () => ReportDetail | undefined;
  footer: () => FastrPagedFooter;
  figureSize: (id: string) => { width: number; height: number } | undefined;
  imageSize: (id: string) => { width: number; height: number } | undefined;
  onResult: (result: FastrPagedResult | undefined) => void;
};

export type ReportPaginator = {
  // Schedule a run after the debounce window (coalescing repeated calls).
  request: () => void;
  // Run now (a theme or page-size change, where the user is waiting on it).
  requestNow: () => void;
  dispose: () => void;
};

const DEBOUNCE_MS = 700;
const LAYOUT_TIMEOUT_MS = 20_000;
const POLL_MS = 80;

export function createReportPaginator(deps: ReportPaginatorDeps): ReportPaginator {
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
      const detail = deps.detail();
      if (detail === undefined) {
        deps.onResult(undefined);
        return;
      }
      const html = await buildStandaloneReportHtml(detail, () => {}, {
        paged: { footer: deps.footer() },
        layoutOnly: {
          figureSize: deps.figureSize,
          imageSize: deps.imageSize,
        },
      });
      if (disposed) return;
      const result = await layoutInFrame(html);
      if (disposed) return;
      deps.onResult(result);
    } catch (e) {
      console.warn("Report pagination failed", e);
      if (!disposed) deps.onResult(undefined);
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
      f.addEventListener("load", () => setTimeout(poll, POLL_MS), { once: true });
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

// The live editor's own measurement of an embed, so the layout frame gives a
// figure the box it actually occupies. Aspect is what matters: the paged
// document scales the box to its column.
export function measureEmbedInEditor(
  root: ParentNode,
  kind: "figure" | "image",
  id: string,
): { width: number; height: number } | undefined {
  const el = root.querySelector<HTMLElement>(
    `[data-embed-kind="${kind}"][data-embed-id="${CSS.escape(id)}"]`,
  );
  if (!el) return undefined;
  if (el instanceof HTMLImageElement && el.naturalWidth > 0) {
    return { width: el.naturalWidth, height: el.naturalHeight };
  }
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return undefined;
  return { width: Math.round(r.width), height: Math.round(r.height) };
}
