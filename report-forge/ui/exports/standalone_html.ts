import {
  buildFastrPagedCss,
  buildFastrReportCss,
  FASTR_THEME_TOKENS,
  type FastrChartPalette,
  fastrChartPalette,
  fastrFigureFitCss,
  fastrForcedBreaksCss,
  fastrGapStretchCss,
  type FastrPagedFooter,
  fastrPagedRunnerJs,
  fastrParagraphSplitsCss,
  fastrPrintTitleHtml,
  type FastrReportTheme,
  type FastrThemeColorOverride,
  FIGURE_EXPORT_WIDTH_PX,
  pagedDocumentScriptsHtml,
  readFastrDocumentSettings,
  renderFastrMarkdownToHtml,
  type ReportDocumentShell,
  sizedPlaceholderImageSrc,
  wrapReportDocument,
} from "../../engine/mod.ts";
// Paged.js is vendored (vendor/PAGEDJS_LICENSE.md): the print metrics the
// editor's page boxes are measured against belong to this exact build, and a
// host has one package fewer to install.
import pagedPolyfill from "./vendor/paged.polyfill.min.js?raw";
import { inlineThemeFontCss } from "./inline_theme_fonts.ts";
import type { ReportImage } from "../editor/embed_resolver.ts";
import {
  figureDarkInkForColors,
  type FigureInkTheme,
  figureLightInkForColors,
  GENERIC_LIGHT_INK,
} from "../figure_ink.ts";
import {
  buildReportBodyNodes,
  type FigureRasterState,
  measureFigureGrounds,
  sanitizeReportHtml,
  stripLazyLoading,
} from "../report_html.ts";
import { loadImageAsDataUrl } from "./save.ts";

// A document as it stands, which is all an export needs of it.
export type ReportDocument = {
  // The document's name: the .html title, the PDF's running footer, the file
  // name of a download.
  title: string;
  body: string;
  theme: FastrReportTheme;
  // A palette that overrides the theme's own.
  colors?: FastrThemeColorOverride;
  images: Record<string, ReportImage>;
  // The figures the document has; a token naming any other id reads
  // "Missing visualization".
  figureIds: readonly string[];
};

// What an export asks of the host: where an image lives, and the pixels of a
// figure (a host with no figures leaves that out).
export type ReportExportHost = {
  assetUrl: (imgFile: string) => string;
  // The figure drawn on a transparent ground in the given ink, at
  // FIGURE_EXPORT_WIDTH_PX wide. Undefined for a figure that cannot be drawn.
  rasterizeFigure?: (
    id: string,
    ink: FigureInkTheme,
    palette: FastrChartPalette,
  ) => Promise<{ url: string; width: number; height: number } | undefined>;
};

// The standalone .html file of a report: the FASTR Markdown body compiles to
// markup and the theme stylesheet rides along in the document head. Same
// builder as the editor preview (sanitize → materialize embeds → base CSS),
// with figures as PNG data URLs and images inlined so the file is
// self-contained (web images/fonts the author referenced stay external).
//
// The same builder also produces the PAGED document (Paged.js + the paged
// sheet, engine/report_fastr_paged.ts) that the editor lays out for its page
// boxes and the PDF is printed from: one document, so they agree.

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
    figureRaster: (id: string, ink: FigureInkTheme) => FigureRasterState;
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
  doc: ReportDocument,
  host: ReportExportHost,
  onDark: (figureId: string) => boolean,
  progress: (pct: number) => void,
  cached?: StandaloneReportOptions["cached"],
): Promise<{
  figures: Map<string, FigureRasterState>;
  images: Map<string, string>;
}> {
  const tokens = FASTR_THEME_TOKENS[doc.theme] ?? FASTR_THEME_TOKENS.default;
  const palette = doc.colors ?? {
    page: tokens.page,
    ink: tokens.ink,
    accent: tokens.accent,
  };
  const lightInk = figureLightInkForColors(palette) ?? GENERIC_LIGHT_INK;
  const darkInk = figureDarkInkForColors(palette);
  const chartPalette = fastrChartPalette(doc.theme, doc.colors);
  const rasters = new Map<string, FigureRasterState>();
  let done = 0;
  for (const id of doc.figureIds) {
    const ink = onDark(id) ? lightInk : darkInk;
    if (cached) {
      rasters.set(id, cached.figureRaster(id, ink));
      continue;
    }
    try {
      // Transparent pixels: the document's CSS owns what shows behind the
      // figure; light ink only on a detected dark ground.
      const r = await host.rasterizeFigure?.(id, ink, chartPalette);
      rasters.set(
        id,
        r ? { state: "ready", ...r } : { state: "missing" },
      );
    } catch {
      // Degrades in place to the "Missing visualization" note.
      rasters.set(id, { state: "missing" });
    }
    done++;
    progress(done / Math.max(1, doc.figureIds.length));
  }
  const imageUrls = new Map<string, string>();
  for (const [id, block] of Object.entries(doc.images)) {
    if (cached) {
      const url = cached.imageUrl(id);
      if (url) imageUrls.set(id, url);
      continue;
    }
    const dataUrl = await loadImageAsDataUrl(host.assetUrl(block.imgFile));
    if (dataUrl) imageUrls.set(id, dataUrl);
  }
  return { figures: rasters, images: imageUrls };
}

export async function buildStandaloneReportHtml(
  doc: ReportDocument,
  host: ReportExportHost,
  progress: (pct: number) => void,
  opts: StandaloneReportOptions = {},
): Promise<string> {
  const customColors = doc.colors;
  const fastrTheme = doc.theme;
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
    const fontImport =
      (FASTR_THEME_TOKENS[fastrTheme] ?? FASTR_THEME_TOKENS.default)
        .fontImport;
    if (fontImport.length > 0) {
      themeCss = themeCss.replace(
        fontImport,
        await inlineThemeFontCss(fontImport),
      );
    }
  }
  if (opts.layoutOnly) {
    return buildLayoutOnlyDocument(doc, themeCss, opts);
  }
  // Ink follows each figure's ACTUAL ground (same rule as the preview): the
  // sanitized document — figure tokens still raw — is mounted in a hidden
  // iframe to measure computed backgrounds before any rasterization. The
  // ground is painted by the theme sheet, so it must be in that document.
  // A paged document keeps its source-line anchors: the editor's pages edit
  // in place through them, and the printed pixels are the same either way.
  const sanitized = sanitizeReportHtml(
    renderFastrMarkdownToHtml(doc.body, {
      lineAnchors: opts.paged !== undefined,
    }),
  );
  const docSettings = readFastrDocumentSettings(doc.body);
  const darkGrounds = await measureFigureGrounds(
    wrapReportDocument({
      title: doc.title,
      bodyHtml: sanitized,
      themeCss,
      documentClass: docSettings.className,
      documentStyle: docSettings.style,
      pageCss: docSettings.pageCss,
    }),
  );
  progress(0.15);
  const { figures: rasters, images: imageUrls } = await loadReportEmbeds(
    doc,
    host,
    (id) => darkGrounds.get(id) === true,
    (v) => progress(0.2 + 0.5 * v),
    opts.cached,
  );
  progress(0.8);
  // Built in the host document's inert <template> — nothing loads or applies
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
    title: doc.title,
    bodyHtml: holder.innerHTML,
    themeCss,
    documentClass: docSettings.className,
    documentStyle: docSettings.style,
    ...pagedDocumentParts(doc, docSettings, opts),
  });
}

// The paged additions, or the plain `@page` rule for an unpaged document.
function pagedDocumentParts(
  doc: ReportDocument,
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
    bodyPrefixHtml: fastrPrintTitleHtml(doc.title),
    bodySuffixHtml: pagedScriptsHtml(),
  };
}

// The editor's pagination frame: the sanitized document with every embed as
// a sized transparent box. No ground measurement (nothing is rasterized to
// ink) and no image fetch — the sizes come from the live editor.
function buildLayoutOnlyDocument(
  doc: ReportDocument,
  themeCss: string,
  opts: StandaloneReportOptions,
): string {
  const sizes = opts.layoutOnly!;
  const sanitized = sanitizeReportHtml(
    renderFastrMarkdownToHtml(doc.body, { lineAnchors: true }),
  );
  const docSettings = readFastrDocumentSettings(doc.body);
  const frag = buildReportBodyNodes(
    document,
    sanitized,
    (id) => {
      if (!doc.figureIds.includes(id)) return { state: "missing" };
      const size = sizes.figureSize(id) ?? FALLBACK_FIGURE_SIZE;
      return {
        state: "ready",
        url: sizedPlaceholderImageSrc(size.width, size.height),
        ...size,
      };
    },
    (id) => {
      if (!(id in doc.images)) return undefined;
      const size = sizes.imageSize(id) ?? FALLBACK_IMAGE_SIZE;
      return sizedPlaceholderImageSrc(size.width, size.height);
    },
  );
  stripLazyLoading(frag);
  const holder = document.createElement("template");
  holder.content.append(frag);
  return wrapReportDocument({
    title: doc.title,
    bodyHtml: holder.innerHTML,
    themeCss,
    documentClass: docSettings.className,
    documentStyle: docSettings.style,
    ...pagedDocumentParts(doc, docSettings, opts),
  });
}
