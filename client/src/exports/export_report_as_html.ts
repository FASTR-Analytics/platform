import {
  type APIResponseNoData,
  buildFastrReportCss,
  FASTR_THEME_TOKENS,
  FIGURE_EXPORT_WIDTH_PX,
  getFastrReportTheme,
  getReportCustomStyle,
  getReportFormat,
  getReportHtmlStyle,
  readFastrDocumentSettings,
  type ReportDetail,
  renderFastrMarkdownToHtml,
} from "lib";
import {
  CustomFigureStyle,
  getFigureAsDataUrlBrowser,
  loadFontsWithTimeout,
  saveAs,
} from "panther";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { figureInputsForDownload } from "./_dashboard_export_model";
import { loadImageEntry } from "./_report_export_maps";
import {
  applyInkTheme,
  figureInkThemeForStyle,
  GENERIC_LIGHT_INK,
} from "~/components/report/report_figure_raster";
import {
  buildReportBodyNodes,
  type FigureRasterState,
  measureFigureGrounds,
  sanitizeReportHtml,
  stripLazyLoading,
  wrapReportDocument,
} from "~/components/report/report_html";

// The standalone .html file and print-to-PDF, for BOTH html-format reports
// (the body is the markup) and FASTR Markdown (the body compiles to markup and
// the theme stylesheet rides along in the document head). Same builder as the
// editor preview (sanitize → materialize embeds → base CSS), with figures as
// PNG data URLs and images inlined so the file is self-contained (web
// images/fonts the author referenced stay external).

export async function buildStandaloneReportHtml(
  detail: ReportDetail,
  progress: (pct: number) => void,
): Promise<string> {
  const figureEntries = Object.entries(detail.figures);
  const format = getReportFormat(detail.config);
  const isFastr = format === "fastr";
  const customColors = getReportCustomStyle(detail.config)?.colors;
  const fastrTheme = getFastrReportTheme(detail.config);
  const themeCss = isFastr
    ? buildFastrReportCss(fastrTheme, customColors ?? undefined)
    : undefined;
  // Ink follows each figure's ACTUAL ground (same rule as the preview): the
  // sanitized document — figure tokens still raw — is mounted in a hidden
  // iframe to measure computed backgrounds before any rasterization. For fastr
  // the ground is painted by the theme sheet, so it must be in that document.
  const sanitized = isFastr
    ? sanitizeReportHtml(
      renderFastrMarkdownToHtml(detail.body, { lineAnchors: false }),
    )
    : sanitizeReportHtml(detail.body);
  const docSettings = isFastr
    ? readFastrDocumentSettings(detail.body)
    : undefined;
  const darkGrounds = await measureFigureGrounds(
    wrapReportDocument({
      title: detail.label,
      bodyHtml: sanitized,
      themeCss,
      documentClass: docSettings?.className,
      documentStyle: docSettings?.style,
      pageCss: docSettings?.pageCss,
    }),
  );
  const fastrTokens = FASTR_THEME_TOKENS[fastrTheme];
  const lightInk = (isFastr
    ? figureInkThemeForStyle(
      "default",
      customColors ?? {
        page: fastrTokens.page,
        ink: fastrTokens.ink,
        accent: fastrTokens.accent,
      },
    )
    : figureInkThemeForStyle(
      getReportHtmlStyle(detail.config),
      customColors,
    )) ?? GENERIC_LIGHT_INK;
  const rasters = new Map<string, FigureRasterState>();
  let done = 0;
  for (const [id, block] of figureEntries) {
    try {
      const bundle = block.bundle;
      if (!bundle) throw new Error("no bundle");
      const fi = buildFigureInputs(bundle);
      await loadFontsWithTimeout(new CustomFigureStyle(fi.style).getFontsToRegister());
      // Transparent, like the preview rasters — the report's CSS owns what
      // shows behind the figure; light ink only on a detected dark ground.
      const r = await getFigureAsDataUrlBrowser(
        applyInkTheme(
          figureInputsForDownload(fi, true, false),
          darkGrounds.get(id) ? lightInk : undefined,
        ),
        FIGURE_EXPORT_WIDTH_PX,
      );
      rasters.set(id, { state: "ready", url: r.dataUrl, width: r.width, height: r.height });
    } catch {
      // Degrades in place to the "Missing visualization" note.
      rasters.set(id, { state: "missing" });
    }
    done++;
    progress(0.2 + 0.5 * (done / Math.max(1, figureEntries.length)));
  }
  const imageUrls = new Map<string, string>();
  for (const [id, block] of Object.entries(detail.images)) {
    const entry = await loadImageEntry(`${_SERVER_HOST}/${block.imgFile}`);
    if (entry) imageUrls.set(id, entry.dataUrl);
  }
  progress(0.8);
  // Built in the APP document's inert <template> — nothing loads or applies
  // until the user opens the file.
  const frag = buildReportBodyNodes(
    document,
    sanitized,
    (id) => rasters.get(id) ?? { state: "missing" },
    (id) => imageUrls.get(id),
  );
  stripLazyLoading(frag);
  const holder = document.createElement("template");
  holder.content.append(frag);
  return wrapReportDocument({
    title: detail.label,
    bodyHtml: holder.innerHTML,
    themeCss,
    documentClass: docSettings?.className,
    documentStyle: docSettings?.style,
    pageCss: docSettings?.pageCss,
  });
}

export async function exportReportAsHtml(
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const res = await serverActions.getReportDetail({
      projectId,
      report_id: reportId,
    });
    if (!res.success) return res;
    const html = await buildStandaloneReportHtml(res.data, progress);
    progress(1);
    saveAs(new Blob([html], { type: "text/html;charset=utf-8" }), `${res.data.label}.html`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting report HTML: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}

// One hidden print frame at a time. Must not be display:none (print needs
// layout); `allow-modals` is what permits print() inside a sandboxed frame. It
// is deliberately NOT torn down on afterprint (some browsers fire it before
// the dialog's work is done) — the previous frame is replaced when the next
// print starts, and a fresh frame guarantees a load event.
let printFrame: HTMLIFrameElement | undefined;

function getPrintFrame(): HTMLIFrameElement {
  printFrame?.remove();
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-same-origin allow-modals");
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(f);
  printFrame = f;
  return f;
}

export async function printReportHtml(
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const res = await serverActions.getReportDetail({
      projectId,
      report_id: reportId,
    });
    if (!res.success) return res;
    const html = await buildStandaloneReportHtml(res.data, progress);
    const frame = getPrintFrame();
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.srcdoc = html;
    });
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error("print frame unavailable");
    await Promise.all(
      Array.from(doc.images).map((img) => img.decode().catch(() => undefined)),
    );
    await doc.fonts?.ready;
    progress(1);
    win.focus();
    win.print();
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error printing report: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
