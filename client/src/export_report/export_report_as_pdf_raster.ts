import {
  APIResponseNoData,
  CanvasRenderContext,
  RectCoordsDims,
  PageRenderer,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import { ProjectDirtyStates } from "lib";
import {
  getReportDetailFromCacheOrFetch,
  getPageInputsFromCacheOrFetch,
} from "~/state/ri_cache";
import jsPDF from "jspdf";

export async function exportReportAsPdfRaster(
  projectId: string,
  reportId: string,
  pdfResolution: number,
  unwrappedPDS: ProjectDirtyStates,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
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

    const pdfOrientation =
      resReportDetail.data.reportType === "slide_deck"
        ? "landscape"
        : "portrait";
    const pdfW = Math.round(canvasW * pdfResolution);
    const pdfH = Math.round(canvasH * pdfResolution);

    const pdf = new jsPDF({
      orientation: pdfOrientation,
      unit: "px",
      format: [pdfW, pdfH],
      // putOnlyUsedFonts: true,
      compress: true,
    });
    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    for (
      let i_item = 0;
      i_item < resReportDetail.data.itemIdsInOrder.length;
      i_item++
    ) {
      const reportItemId = resReportDetail.data.itemIdsInOrder[i_item];
      await new Promise((res) => setTimeout(res, 0));
      progress(
        0.2 + (0.8 * i_item) / resReportDetail.data.itemIdsInOrder.length,
      );
      if (i_item > 0) {
        pdf.addPage([pdfW, pdfH], pdfOrientation);
      }

      const resPageInputs = await getPageInputsFromCacheOrFetch(
        projectId,
        reportId,
        reportItemId,
        pdfResolution,
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = pdfW;
      offscreenCanvas.height = pdfH;
      const offscreenCtx = offscreenCanvas.getContext("2d")!;

      const rc = new CanvasRenderContext(
        offscreenCtx as unknown as CanvasRenderingContext2D,
      );
      const rcd = new RectCoordsDims([
        0,
        0,
        offscreenCanvas.width,
        offscreenCanvas.height,
      ]);
      await PageRenderer.measureAndRender(
        rc,
        rcd,
        resPageInputs.data.pageInputs,
        pdfResolution,
      );
      pdf.addImage(offscreenCanvas, "png", 0, 0, pdfW, pdfH);
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(1);
    pdf.save("report.pdf");
    return { success: true };
  } catch {
    return { success: false, err: "Error creating report" };
  }
}
