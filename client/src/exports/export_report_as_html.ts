import {
  type FigureBlock,
  getFastrReportTheme,
  getReportCustomStyle,
  type ReportDetail,
} from "lib";
import {
  buildStandaloneReportHtml as buildStandaloneDocument,
  FIGURE_EXPORT_WIDTH_PX,
  type FigureInkTheme,
  type FigureRasterState,
  type ReportDocument,
  type ReportExportHost,
  type StandaloneReportOptions as DocumentOptions,
} from "report-forge";
import {
  CustomFigureStyle,
  getFigureAsDataUrlBrowser,
  loadFontsWithTimeout,
} from "panther";
import { resolveLogoUrl } from "~/generate_slide_deck/fastr_logos";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { applyInkTheme, figureInputsForDownload } from "~/generate_report/mod";

// A stored report as the document Report Forge exports, and this app's half
// of an export: where an image lives, and the pixels of a figure (drawn here,
// by panther, from the report's own figure blocks). The document builder
// itself (the standalone .html, the paged document the PDF is printed from,
// the layout-only frame) is report-forge/ui/exports/standalone_html.ts.

export function reportDocumentOf(detail: ReportDetail): ReportDocument {
  return {
    title: detail.label,
    body: detail.body,
    theme: getFastrReportTheme(detail.config),
    colors: getReportCustomStyle(detail.config)?.colors ?? undefined,
    images: detail.images,
    figureIds: Object.keys(detail.figures),
  };
}

export function reportExportHostOf(
  figures: Record<string, FigureBlock>,
): ReportExportHost {
  return {
    assetUrl: resolveLogoUrl,
    rasterizeFigure: async (id, ink, palette) => {
      const bundle = figures[id]?.bundle;
      if (!bundle) return undefined;
      const fi = buildFigureInputs(bundle, undefined, palette);
      await loadFontsWithTimeout(
        new CustomFigureStyle(fi.style).getFontsToRegister(),
      );
      // Transparent, like the preview rasters: the report's CSS owns what
      // shows behind the figure.
      const r = await getFigureAsDataUrlBrowser(
        applyInkTheme(figureInputsForDownload(fi, true, false), ink),
        FIGURE_EXPORT_WIDTH_PX,
      );
      return { url: r.dataUrl, width: r.width, height: r.height };
    },
  };
}

// As the package's options, with the cache keyed by this app's figure block
// (the raster cache is content-keyed on the block).
export type StandaloneReportOptions = Omit<DocumentOptions, "cached"> & {
  cached?: {
    figureRaster: (
      id: string,
      block: FigureBlock,
      ink: FigureInkTheme,
    ) => FigureRasterState;
    imageUrl: (id: string) => string | undefined;
  };
};

function cachedFor(
  detail: ReportDetail,
  cached: StandaloneReportOptions["cached"],
): DocumentOptions["cached"] {
  if (cached === undefined) return undefined;
  return {
    figureRaster: (id, ink) => {
      const block = detail.figures[id];
      return block ? cached.figureRaster(id, block, ink) : { state: "missing" };
    },
    imageUrl: cached.imageUrl,
  };
}

export function buildStandaloneReportHtml(
  detail: ReportDetail,
  progress: (pct: number) => void,
  opts: StandaloneReportOptions = {},
): Promise<string> {
  return buildStandaloneDocument(
    reportDocumentOf(detail),
    reportExportHostOf(detail.figures),
    progress,
    { ...opts, cached: cachedFor(detail, opts.cached) },
  );
}
