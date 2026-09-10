// The page map for the AI (get_report_pages): lay a FASTR Markdown report
// out as the PDF's pages, in the editor's hidden frame (paginate_report.ts,
// the same paged document the server prints), and describe what landed
// where (lib/fastr_report_page_map.ts). Figures take the box their raster
// will have (the size cache, measured first) and images their natural size,
// as in the editor, so the map is the PDF's pages give or take a fit.

import { fastrPageMapText, type FastrPagedResult, type ReportDetail } from "lib";
import { createReportPaginator } from "./paginate_report";
import { createFigureSizeCache } from "./report_figure_raster";
import { fastrPagedFooter } from "~/exports/export_report_as_paged_pdf";

const SIZE_WAIT_MS = 12_000;
const LAYOUT_WAIT_MS = 25_000;

export async function describeReportPages(
  detail: ReportDetail,
  assetUrl: (imgFile: string) => string,
): Promise<string> {
  // Every figure's box first: a size landing after the layout would have
  // left that figure a zero-height box on the page.
  let sizeLanded: (() => void) | undefined;
  const figureSizes = createFigureSizeCache(() => sizeLanded?.());
  const imageSizes = new Map<string, { width: number; height: number }>();
  try {
    const figureIds = Object.keys(detail.figures);
    const imageIds = Object.keys(detail.images);
    const started = Date.now();
    await Promise.all(imageIds.map(async (id) => {
      const entry = detail.images[id];
      if (!entry) return;
      const size = await new Promise<{ width: number; height: number } | undefined>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve(undefined);
        img.src = assetUrl(entry.imgFile);
      });
      if (size) imageSizes.set(id, size);
    }));
    for (;;) {
      const pending = figureIds.filter((id) => {
        const block = detail.figures[id];
        return block !== undefined && block.bundle !== undefined && figureSizes.get(id, block) === undefined;
      });
      if (pending.length === 0 || Date.now() - started > SIZE_WAIT_MS) break;
      await new Promise<void>((resolve) => {
        sizeLanded = resolve;
        setTimeout(resolve, 500);
      });
    }
    const result = await new Promise<FastrPagedResult | undefined>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The page layout timed out.")), LAYOUT_WAIT_MS);
      const paginator = createReportPaginator({
        detail: () => detail,
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
    });
    if (result === undefined) return "The page layout did not run (the body may be empty).";
    return fastrPageMapText(result, detail.body);
  } finally {
    figureSizes.dispose();
  }
}
