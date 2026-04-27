import { ProjectDirtyStates } from "lib";
import {
  APIResponseNoData,
  pagesToPptxBrowser,
  PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  saveAs,
} from "panther";
import {
  getReportDetailFromCacheOrFetch,
  getPageInputsFromCacheOrFetch,
} from "~/state/ri_cache";

export async function exportReportAsPptx(
  projectId: string,
  reportId: string,
  unwrappedPDS: ProjectDirtyStates,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  let currentSlideNumber = 0;
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const resReportDetail = await getReportDetailFromCacheOrFetch(
      projectId,
      reportId,
    );

    await new Promise((res) => setTimeout(res, 0));
    progress(0.1);
    if (resReportDetail.success === false) {
      return resReportDetail;
    }

    const canvasW = _GLOBAL_CANVAS_PIXEL_WIDTH;
    const canvasH =
      resReportDetail.data.reportType === "slide_deck"
        ? Math.round((canvasW * 9) / 16)
        : Math.round((canvasW * 297) / 210);

    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    const pages: PageInputs[] = [];

    for (
      let i_item = 0;
      i_item < resReportDetail.data.itemIdsInOrder.length;
      i_item++
    ) {
      currentSlideNumber = i_item + 1;
      const reportItemId = resReportDetail.data.itemIdsInOrder[i_item];
      await new Promise((res) => setTimeout(res, 0));
      progress(
        0.2 + (0.7 * i_item) / resReportDetail.data.itemIdsInOrder.length,
      );

      const resPageInputs = await getPageInputsFromCacheOrFetch(
        projectId,
        reportId,
        reportItemId,
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      pages.push(resPageInputs.data.pageInputs);
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(0.95);

    const pptx = pagesToPptxBrowser(pages, canvasW, canvasH);
    const blob = (await pptx.write({ outputType: "blob" })) as Blob;
    saveAs(blob, "report.pptx");

    await new Promise((res) => setTimeout(res, 0));
    progress(1);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err:
        `Error creating report slide ${currentSlideNumber}: ` +
        (e instanceof Error ? e.message : ""),
    };
  }
}
