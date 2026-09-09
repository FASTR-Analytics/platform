import {
  type APIResponseNoData,
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_THEME_TOKENS,
  type FastrPagedFooter,
  fastrPagedRunnerJs,
  fastrPrintTitleHtml,
  sizedPlaceholderImageSrc,
  FIGURE_EXPORT_WIDTH_PX,
  fastrChartPalette,
  getFastrReportTheme,
  getReportCustomStyle,
  getReportFormat,
  getReportHtmlStyle,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  type ReportDetail,
  type ReportDocumentShell,
  renderFastrMarkdownToHtml,
} from "lib";
// Relative into node_modules on purpose: pagedjs's package "exports" map
// exposes no subpath, so the bare specifier cannot reach the dist file.
import pagedPolyfill from "../../node_modules/pagedjs/dist/paged.polyfill.min.js?raw";
import { inlineThemeFontCss } from "./inline_theme_fonts";
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
  figureDarkInkForColors,
  type FigureInkTheme,
  figureInkThemeForStyle,
  GENERIC_LIGHT_INK,
} from "~/components/report/report_figure_raster";
import type { FigureBlock } from "lib";
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
//
// The same builder also produces the PAGED document (Paged.js + the paged
// sheet, lib/report_fastr_paged.ts) that the editor lays out for its page
// boxes and the server prints to PDF — one document, so they agree.

export type StandaloneReportOptions = {
  // Lay the document out as printed pages: the paged sheet, the running
  // footer's title, and the Paged.js polyfill + runner at the end of <body>.
  paged?: { footer: FastrPagedFooter };
  // Embed the theme's web fonts as data URLs (the server render has no
  // network; the editor's frame already has them and skips this).
  inlineFonts?: boolean;
  // Layout only: no rasterization at all. Figures and images become
  // transparent placeholders at their known size, so pagination costs a
  // layout pass rather than a render of every chart. Unknown sizes fall back
  // to a 16:9 box at the export width.
  layoutOnly?: {
    figureSize: (id: string) => { width: number; height: number } | undefined;
    imageSize: (id: string) => { width: number; height: number } | undefined;
  };
  // The editor's pages: rasters from the host's content-keyed cache (blob
  // URLs, the same pixels the export draws) instead of a fresh render per
  // layout, and images by URL rather than inlined. `ink` is the figure's
  // ground-appropriate ink, measured exactly as the export measures it.
  cached?: {
    figureRaster: (id: string, block: FigureBlock, ink: FigureInkTheme) => FigureRasterState;
    imageUrl: (id: string) => string | undefined;
  };
};

function pagedScriptsHtml(): string {
  return pagedDocumentScriptsHtml(pagedPolyfill, fastrPagedRunnerJs());
}

const FALLBACK_FIGURE_SIZE = {
  width: FIGURE_EXPORT_WIDTH_PX,
  height: Math.round(FIGURE_EXPORT_WIDTH_PX * 9 / 16),
};
const FALLBACK_IMAGE_SIZE = { width: 1200, height: 675 };

export async function buildStandaloneReportHtml(
  detail: ReportDetail,
  progress: (pct: number) => void,
  opts: StandaloneReportOptions = {},
): Promise<string> {
  const figureEntries = Object.entries(detail.figures);
  const format = getReportFormat(detail.config);
  const isFastr = format === "fastr";
  const customColors = getReportCustomStyle(detail.config)?.colors;
  const fastrTheme = getFastrReportTheme(detail.config);
  // A paged document (the PDF, the editor's layout frame) owns its breaks
  // and must carry none of the browser-print rules the .html download
  // needs; see BROWSER_PRINT_CSS.
  const paged = opts.paged !== undefined || opts.layoutOnly !== undefined;
  let themeCss = isFastr
    ? buildFastrReportCss(fastrTheme, customColors ?? undefined, "", { omitPrintRules: paged })
    : undefined;
  if (isFastr && themeCss !== undefined && opts.inlineFonts) {
    const fontImport = FASTR_THEME_TOKENS[fastrTheme].fontImport;
    if (fontImport.length > 0) {
      themeCss = themeCss.replace(fontImport, await inlineThemeFontCss(fontImport));
    }
  }
  if (opts.layoutOnly) {
    return buildLayoutOnlyDocument(detail, themeCss, opts);
  }
  // Ink follows each figure's ACTUAL ground (same rule as the preview): the
  // sanitized document — figure tokens still raw — is mounted in a hidden
  // iframe to measure computed backgrounds before any rasterization. For fastr
  // the ground is painted by the theme sheet, so it must be in that document.
  // A paged document keeps its source-line anchors: the editor's pages edit
  // in place through them, and the printed pixels are the same either way.
  const sanitized = isFastr
    ? sanitizeReportHtml(
      renderFastrMarkdownToHtml(detail.body, { lineAnchors: opts.paged !== undefined }),
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
  progress(0.15);
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
  const darkInk = figureDarkInkForColors(
    isFastr
      ? customColors ?? {
        page: fastrTokens.page,
        ink: fastrTokens.ink,
        accent: fastrTokens.accent,
      }
      : customColors,
  );
  const rasters = new Map<string, FigureRasterState>();
  let done = 0;
  for (const [id, block] of figureEntries) {
    if (opts.cached) {
      rasters.set(
        id,
        opts.cached.figureRaster(id, block, darkGrounds.get(id) ? lightInk : darkInk),
      );
      continue;
    }
    try {
      const bundle = block.bundle;
      if (!bundle) throw new Error("no bundle");
      const fi = buildFigureInputs(
        bundle,
        undefined,
        isFastr ? fastrChartPalette(fastrTheme, customColors) : undefined,
      );
      await loadFontsWithTimeout(new CustomFigureStyle(fi.style).getFontsToRegister());
      // Transparent, like the preview rasters — the report's CSS owns what
      // shows behind the figure; light ink only on a detected dark ground.
      const r = await getFigureAsDataUrlBrowser(
        applyInkTheme(
          figureInputsForDownload(fi, true, false),
          darkGrounds.get(id) ? lightInk : darkInk,
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
    if (opts.cached) {
      const url = opts.cached.imageUrl(id);
      if (url) imageUrls.set(id, url);
      continue;
    }
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
    ...pagedDocumentParts(detail, docSettings, opts),
  });
}

// The paged additions, or the plain `@page` rule for an unpaged document.
function pagedDocumentParts(
  detail: ReportDetail,
  docSettings: ReturnType<typeof readFastrDocumentSettings> | undefined,
  opts: StandaloneReportOptions,
): Partial<
  Pick<
    ReportDocumentShell,
    "pageCss" | "headExtraCss" | "bodyPrefixHtml" | "bodySuffixHtml"
  >
> {
  if (!opts.paged) return { pageCss: docSettings?.pageCss };
  // The paged sheet owns @page; an html-format report (no header) prints A4.
  const setup = docSettings?.page ?? readFastrDocumentSettings("").page;
  return {
    headExtraCss: buildFastrPagedCss(setup, opts.paged.footer),
    bodyPrefixHtml: fastrPrintTitleHtml(detail.label),
    bodySuffixHtml: pagedScriptsHtml(),
  };
}

// The editor's pagination frame: the sanitized document with every embed as
// a sized transparent box. No ground measurement (nothing is rasterized to
// ink) and no image fetch — the sizes come from the live editor.
function buildLayoutOnlyDocument(
  detail: ReportDetail,
  themeCss: string | undefined,
  opts: StandaloneReportOptions,
): string {
  const sizes = opts.layoutOnly!;
  const isFastr = getReportFormat(detail.config) === "fastr";
  const sanitized = isFastr
    ? sanitizeReportHtml(
      renderFastrMarkdownToHtml(detail.body, { lineAnchors: true }),
    )
    : sanitizeReportHtml(detail.body);
  const docSettings = isFastr ? readFastrDocumentSettings(detail.body) : undefined;
  const frag = buildReportBodyNodes(
    document,
    sanitized,
    (id) => {
      if (!(id in detail.figures)) return { state: "missing" };
      const size = sizes.figureSize(id) ?? FALLBACK_FIGURE_SIZE;
      return { state: "ready", url: sizedPlaceholderImageSrc(size.width, size.height), ...size };
    },
    (id) => {
      if (!(id in detail.images)) return undefined;
      const size = sizes.imageSize(id) ?? FALLBACK_IMAGE_SIZE;
      return sizedPlaceholderImageSrc(size.width, size.height);
    },
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
    ...pagedDocumentParts(detail, docSettings, opts),
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
