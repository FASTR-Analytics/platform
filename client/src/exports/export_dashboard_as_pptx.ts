import { pagesToPptxBrowser, saveAs } from "panther";
import { type APIResponseNoData, PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import {
  type DashboardExportModel,
  sanitizeFilename,
} from "./_dashboard_export_model";
import {
  buildDashboardPages,
  type DashboardPagesOpts,
  exportFilenameBasis,
} from "./_dashboard_pages";

export async function exportDashboardAsPptx(
  model: DashboardExportModel,
  opts: DashboardPagesOpts,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const pages = await buildDashboardPages(model, opts, (frac) =>
      progress(0.05 + 0.7 * frac),
    );

    progress(0.8);
    // 16:9 native slides; each figure is rasterized to a PNG on its slide.
    const pptx = pagesToPptxBrowser(pages, PAGE_WIDTH_DU, PAGE_HEIGHT_DU);
    const blob = (await pptx.write({ outputType: "blob" })) as Blob;

    progress(0.97);
    saveAs(blob, `${sanitizeFilename(exportFilenameBasis(model))}.pptx`);
    progress(1);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err:
        "Error exporting dashboard PowerPoint: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
