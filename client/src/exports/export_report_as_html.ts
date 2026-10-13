import {
  type APIResponseNoData,
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_THEME_TOKENS,
  fastrChartPalette,
  fastrFigureFitCss,
  fastrForcedBreaksCss,
  fastrGapStretchCss,
  type FastrPagedFooter,
  fastrPagedRunnerJs,
  fastrParagraphSplitsCss,
  fastrPrintTitleHtml,
  FIGURE_EXPORT_WIDTH_PX,
  getFastrReportTheme,
  getReportCustomStyle,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  type ReportDetail,
  type ReportDocumentShell,
  sizedPlaceholderImageSrc,
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
import { serverActions } from "~/server_actions";
import { resolveLogoUrl } from "~/generate_slide_deck/fastr_logos";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { figureInputsForDownload } from "~/generate_report/mod";
import { loadImageEntry } from "~/generate_report/mod";
import {
  applyInkTheme,
  figureDarkInkForColors,
  type FigureInkTheme,
  figureLightInkForColors,
  GENERIC_LIGHT_INK,
} from "~/generate_report/mod";
import type { FigureBlock } from "lib";
import {
  buildReportBodyNodes,
  type FigureRasterState,
  measureFigureGrounds,
  sanitizeReportHtml,
  stripLazyLoading,
  wrapReportDocument,
} from "~/generate_report/mod";

// The standalone .html file of a report: the FASTR Markdown body compiles to
// markup and the theme stylesheet rides along in the document head. Same
// builder as the editor preview (sanitize → materialize embeds → base CSS),
// with figures as PNG data URLs and images inlined so the file is
// self-contained (web images/fonts the author referenced stay external).
//
// The same builder also produces the PAGED document (Paged.js + the paged
// sheet, report-forge/engine/report_fastr_paged.ts) that the editor lays out for its page
// boxes and the server prints to PDF — one document, so they agree.

export type StandaloneReportOptions = {
  // Lay the document out as printed pages: the paged sheet, the running
  // footer's title, and the Paged.js polyfill + runner at the end of <body>.
  paged?: {
    footer: FastrPagedFooter;
    // The 0-based source lines that open page 2 onward, as the editor laid
    // the document out; forced on Paged.js so the PDF breaks where the
    // editor's page boxes did. Absent, Paged.js decides by the same rules.
    pageStarts?: readonly number[];
    // The paragraphs the editor ran on to a next page, and the wrapped rows
    // that open one (fastrParagraphSplitsCss).
    paraSplits?: readonly { line: number; rows: readonly number[] }[];
    // The figures the editor shrank to fill their pages: each image's
    // height, px (fastrFigureFitCss).
    figureFits?: readonly { line: number; height: number }[];
    // The gaps the editor stretched to set a page: the block after each
    // and its whole top margin, px (fastrGapStretchCss).
    gapStretches?: readonly { line: number; marginTop: number }[];
  };
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
    figureRaster: (
      id: string,
      block: FigureBlock,
      ink: FigureInkTheme,
    ) => FigureRasterState;
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

// A report's figures and images as pixels: each figure drawn once, in light
// ink when `onDark` says it stands on a dark ground, and each image inlined
// (or both from the host's cache, see StandaloneReportOptions.cached). Shared
// by the standalone document below and the Word export, which embeds the
// same pixels without building a document.
export async function loadReportEmbeds(
  detail: ReportDetail,
  onDark: (figureId: string) => boolean,
  progress: (pct: number) => void,
  cached?: StandaloneReportOptions["cached"],
): Promise<{
  figures: Map<string, FigureRasterState>;
  images: Map<string, string>;
}> {
  const figureEntries = Object.entries(detail.figures);
  const customColors = getReportCustomStyle(detail.config)?.colors;
  const fastrTheme = getFastrReportTheme(detail.config);
  const fastrTokens = FASTR_THEME_TOKENS[fastrTheme];
  const lightInk = figureLightInkForColors(
    customColors ?? {
      page: fastrTokens.page,
      ink: fastrTokens.ink,
      accent: fastrTokens.accent,
    },
  ) ?? GENERIC_LIGHT_INK;
  const darkInk = figureDarkInkForColors(
    customColors ?? {
      page: fastrTokens.page,
      ink: fastrTokens.ink,
      accent: fastrTokens.accent,
    },
  );
  const rasters = new Map<string, FigureRasterState>();
  let done = 0;
  for (const [id, block] of figureEntries) {
    if (cached) {
      rasters.set(
        id,
        cached.figureRaster(id, block, onDark(id) ? lightInk : darkInk),
      );
      continue;
    }
    try {
      const bundle = block.bundle;
      if (!bundle) throw new Error("no bundle");
      const fi = buildFigureInputs(
        bundle,
        undefined,
        fastrChartPalette(fastrTheme, customColors),
      );
      await loadFontsWithTimeout(
        new CustomFigureStyle(fi.style).getFontsToRegister(),
      );
      // Transparent, like the preview rasters — the report's CSS owns what
      // shows behind the figure; light ink only on a detected dark ground.
      const r = await getFigureAsDataUrlBrowser(
        applyInkTheme(
          figureInputsForDownload(fi, true, false),
          onDark(id) ? lightInk : darkInk,
        ),
        FIGURE_EXPORT_WIDTH_PX,
      );
      rasters.set(id, {
        state: "ready",
        url: r.dataUrl,
        width: r.width,
        height: r.height,
      });
    } catch {
      // Degrades in place to the "Missing visualization" note.
      rasters.set(id, { state: "missing" });
    }
    done++;
    progress(done / Math.max(1, figureEntries.length));
  }
  const imageUrls = new Map<string, string>();
  for (const [id, block] of Object.entries(detail.images)) {
    if (cached) {
      const url = cached.imageUrl(id);
      if (url) imageUrls.set(id, url);
      continue;
    }
    const entry = await loadImageEntry(resolveLogoUrl(block.imgFile));
    if (entry) imageUrls.set(id, entry.dataUrl);
  }
  return { figures: rasters, images: imageUrls };
}

export async function buildStandaloneReportHtml(
  detail: ReportDetail,
  progress: (pct: number) => void,
  opts: StandaloneReportOptions = {},
): Promise<string> {
  const customColors = getReportCustomStyle(detail.config)?.colors;
  const fastrTheme = getFastrReportTheme(detail.config);
  // A paged document (the PDF, the editor's layout frame) owns its breaks
  // and must carry none of the browser-print rules the .html download
  // needs; see BROWSER_PRINT_CSS.
  const paged = opts.paged !== undefined || opts.layoutOnly !== undefined;
  let themeCss = buildFastrReportCss(
    fastrTheme,
    customColors ?? undefined,
    "",
    {
      omitPrintRules: paged,
    },
  );
  if (opts.inlineFonts) {
    const fontImport = FASTR_THEME_TOKENS[fastrTheme].fontImport;
    if (fontImport.length > 0) {
      themeCss = themeCss.replace(
        fontImport,
        await inlineThemeFontCss(fontImport),
      );
    }
  }
  if (opts.layoutOnly) {
    return buildLayoutOnlyDocument(detail, themeCss, opts);
  }
  // Ink follows each figure's ACTUAL ground (same rule as the preview): the
  // sanitized document — figure tokens still raw — is mounted in a hidden
  // iframe to measure computed backgrounds before any rasterization. The
  // ground is painted by the theme sheet, so it must be in that document.
  // A paged document keeps its source-line anchors: the editor's pages edit
  // in place through them, and the printed pixels are the same either way.
  const sanitized = sanitizeReportHtml(
    renderFastrMarkdownToHtml(detail.body, {
      lineAnchors: opts.paged !== undefined,
    }),
  );
  const docSettings = readFastrDocumentSettings(detail.body);
  const darkGrounds = await measureFigureGrounds(
    wrapReportDocument({
      title: detail.label,
      bodyHtml: sanitized,
      themeCss,
      documentClass: docSettings.className,
      documentStyle: docSettings.style,
      pageCss: docSettings.pageCss,
    }),
  );
  progress(0.15);
  const { figures: rasters, images: imageUrls } = await loadReportEmbeds(
    detail,
    (id) => darkGrounds.get(id) === true,
    (v) => progress(0.2 + 0.5 * v),
    opts.cached,
  );
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
    documentClass: docSettings.className,
    documentStyle: docSettings.style,
    ...pagedDocumentParts(detail, docSettings, opts),
  });
}

// The paged additions, or the plain `@page` rule for an unpaged document.
function pagedDocumentParts(
  detail: ReportDetail,
  docSettings: ReturnType<typeof readFastrDocumentSettings>,
  opts: StandaloneReportOptions,
): Partial<
  Pick<
    ReportDocumentShell,
    "pageCss" | "headExtraCss" | "bodyPrefixHtml" | "bodySuffixHtml"
  >
> {
  if (!opts.paged) {
    return { pageCss: docSettings.pageCss };
  }
  // The paged sheet owns @page.
  const setup = docSettings.page;
  return {
    headExtraCss: buildFastrPagedCss(setup, opts.paged.footer) +
      (opts.paged.pageStarts !== undefined
        ? fastrForcedBreaksCss(opts.paged.pageStarts)
        : "") +
      fastrParagraphSplitsCss(opts.paged.paraSplits ?? []) +
      fastrFigureFitCss(opts.paged.figureFits ?? []) +
      fastrGapStretchCss(opts.paged.gapStretches ?? []),
    bodyPrefixHtml: fastrPrintTitleHtml(detail.label),
    bodySuffixHtml: pagedScriptsHtml(),
  };
}

// The editor's pagination frame: the sanitized document with every embed as
// a sized transparent box. No ground measurement (nothing is rasterized to
// ink) and no image fetch — the sizes come from the live editor.
function buildLayoutOnlyDocument(
  detail: ReportDetail,
  themeCss: string,
  opts: StandaloneReportOptions,
): string {
  const sizes = opts.layoutOnly!;
  const sanitized = sanitizeReportHtml(
    renderFastrMarkdownToHtml(detail.body, { lineAnchors: true }),
  );
  const docSettings = readFastrDocumentSettings(detail.body);
  const frag = buildReportBodyNodes(
    document,
    sanitized,
    (id) => {
      if (!(id in detail.figures)) return { state: "missing" };
      const size = sizes.figureSize(id) ?? FALLBACK_FIGURE_SIZE;
      return {
        state: "ready",
        url: sizedPlaceholderImageSrc(size.width, size.height),
        ...size,
      };
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
    documentClass: docSettings.className,
    documentStyle: docSettings.style,
    ...pagedDocumentParts(detail, docSettings, opts),
  });
}

export async function exportReportAsHtml(
  productId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const res = await serverActions.getReportDetail({
      product_id: productId,
    });
    if (!res.success) return res;
    const html = await buildStandaloneReportHtml(res.data, progress);
    progress(1);
    saveAs(
      new Blob([html], { type: "text/html;charset=utf-8" }),
      `${res.data.label}.html`,
    );
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting report HTML: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
