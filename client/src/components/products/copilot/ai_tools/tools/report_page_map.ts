// The page map for the AI (get_report_pages): lay a FASTR Markdown report
// out as the PDF's pages, in the editor's hidden frame (Report Forge's
// paginator, the same paged document the server prints), and describe what
// landed
// where (report-forge/engine/fastr_report_page_map.ts). Figures take the box their raster
// will have (the size cache, measured first) and images their natural size,
// as in the editor, so the map is the PDF's pages give or take a fit.

import {
  type FastrChartPalette,
  fastrChartPalette,
  type FastrPagedResult,
  fastrPageMapText,
  getFastrReportTheme,
  getReportCustomStyle,
  type ReportDetail,
} from "lib";
import { createReportPaginator, fastrPagedFooter } from "report-forge";
import {
  createFigureSizeCache,
  type FigureSizeCache,
} from "~/generate_report/mod";
import { reportDocumentOf } from "~/exports/export_report_as_html";

const SIZE_WAIT_MS = 12_000;
const LAYOUT_WAIT_MS = 25_000;

// One size cache for every page map the AI asks for. A size is keyed by the
// figure's content and its palette's font, so a draft laid out again after a
// few small edits (rewrite_report, then edit_report_draft) reuses every
// figure already measured instead of drawing each at export width again.
// The AI's tools run one at a time, so the palette is the current call's.
let sharedPalette: FastrChartPalette | undefined;
const sizeListeners = new Set<() => void>();
let sharedSizes: FigureSizeCache | undefined;

function figureSizesFor(palette: FastrChartPalette): FigureSizeCache {
  sharedPalette = palette;
  sharedSizes ??= createFigureSizeCache(
    () => sizeListeners.forEach((l) => l()),
    () => sharedPalette,
  );
  return sharedSizes;
}

// A hidden tab throttles timers (Chrome: to once a minute after five
// minutes), and the layout polls its frame on timers, so a layout started
// while the user is in another tab during a long AI run timed out (2026-11-05:
// a draft was proposed with two half-empty pages, its check having failed).
// The layout waits until the tab is shown again.
function untilVisible(): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

export async function describeReportPages(
  detail: ReportDetail,
  assetUrl: (imgFile: string) => string,
): Promise<string> {
  await untilVisible();
  // Every figure's box first: a size landing after the layout would have
  // left that figure a zero-height box on the page.
  let sizeLanded: (() => void) | undefined;
  // Its theme's chart face changes a figure's box, so sizes take its palette.
  const palette = fastrChartPalette(
    getFastrReportTheme(detail.config),
    getReportCustomStyle(detail.config)?.colors ?? undefined,
  );
  const figureSizes = figureSizesFor(palette);
  const onSize = () => sizeLanded?.();
  sizeListeners.add(onSize);
  const imageSizes = new Map<string, { width: number; height: number }>();
  try {
    const figureIds = Object.keys(detail.figures);
    const imageIds = Object.keys(detail.images);
    const started = Date.now();
    await Promise.all(imageIds.map(async (id) => {
      const entry = detail.images[id];
      if (!entry) return;
      const size = await new Promise<
        { width: number; height: number } | undefined
      >((resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(undefined);
        img.src = assetUrl(entry.imgFile);
      });
      if (size) imageSizes.set(id, size);
    }));
    for (;;) {
      const pending = figureIds.filter((id) => {
        const block = detail.figures[id];
        return block !== undefined && block.bundle !== undefined &&
          figureSizes.get(id, block) === undefined;
      });
      if (pending.length === 0 || Date.now() - started > SIZE_WAIT_MS) break;
      await new Promise<void>((resolve) => {
        sizeLanded = resolve;
        setTimeout(resolve, 500);
      });
    }
    const result = await new Promise<FastrPagedResult | undefined>(
      (resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                document.visibilityState === "visible"
                  ? "The page layout timed out."
                  : "The page layout timed out while the tab was hidden.",
              ),
            ),
          LAYOUT_WAIT_MS,
        );
        const paginator = createReportPaginator({
          document: () => reportDocumentOf(detail),
          footer: () => fastrPagedFooter(detail.label),
          figureSize: (id) => {
            const block = detail.figures[id];
            return block ? figureSizes.get(id, block) : undefined;
          },
          imageSize: (id) => imageSizes.get(id),
          onResult: (r) => {
            clearTimeout(timer);
            paginator.dispose();
            resolve(r);
          },
        });
        paginator.requestNow();
      },
    );
    if (result === undefined) {
      return "The page layout did not run (the body may be empty).";
    }
    return fastrPageMapText(
      result,
      detail.body,
      getFastrReportTheme(detail.config),
    );
  } finally {
    sizeListeners.delete(onSize);
  }
}
