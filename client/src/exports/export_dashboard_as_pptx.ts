import {
  createItemNode,
  type PageContentItem,
  type PageInputs,
  pagesToPptxBrowser,
  saveAs,
} from "panther";
import { type APIResponseNoData } from "lib";
import {
  type DashboardExportModel,
  sanitizeFilename,
} from "./_dashboard_export_model";
import {
  exportFilenameBasis,
  placeholderMarkdown,
  prepareFigures,
} from "./_dashboard_pages";

// 16:9 slides, same width as the PDF pages.
const PPTX_PAGE_WIDTH = 1200;
const PPTX_PAGE_HEIGHT = Math.round((PPTX_PAGE_WIDTH * 9) / 16); // 675

export async function exportDashboardAsPptx(
  model: DashboardExportModel,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const prepared = await prepareFigures(model, (frac) =>
      progress(0.05 + 0.7 * frac),
    );

    // No header / no frontmatter — each 16:9 slide is just the figure (or a
    // placeholder for a figure that failed to render).
    const pages: PageInputs[] = prepared.map((pf) => ({
      type: "freeform",
      content: createItemNode<PageContentItem>(
        pf.figureInputs ?? { markdown: placeholderMarkdown() },
      ),
    }));

    progress(0.85);
    const pptx = pagesToPptxBrowser(pages, PPTX_PAGE_WIDTH, PPTX_PAGE_HEIGHT);
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
