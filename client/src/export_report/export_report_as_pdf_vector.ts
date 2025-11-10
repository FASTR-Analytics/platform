import { ProjectDirtyStates, getTextRenderingOptions } from "lib";
import {
  APIResponseNoData,
  RectCoordsDims,
  PageRenderer,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  _GLOBAL_PDF_PIXEL_WIDTH,
} from "panther";
import {
  getReportDetailFromCacheOrFetch,
  getPageInputsFromCacheOrFetch,
} from "~/state/ri_cache";
import { PdfRenderContext } from "panther";
// import { PdfRenderContext } from "./pdf_render_context";

export async function exportReportAsPdfVector(
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

    const pdfScaleFactor = _GLOBAL_PDF_PIXEL_WIDTH / _GLOBAL_CANVAS_PIXEL_WIDTH;
    const pdfW = _GLOBAL_PDF_PIXEL_WIDTH;
    const pdfH =
      resReportDetail.data.reportType === "slide_deck"
        ? Math.round((pdfW * 9) / 16)
        : Math.round((pdfW * 297) / 210);

    const pdfOrientation =
      resReportDetail.data.reportType === "slide_deck"
        ? "landscape"
        : "portrait";

    const { default: jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: pdfOrientation,
      unit: "px",
      format: [pdfW, pdfH],
      // putOnlyUsedFonts: true,
      compress: true,
    });

    /////////////////////
    //                 //
    //    Add fonts    //
    //                 //
    /////////////////////
    pdf.addFont("/fonts/Inter-Bold.ttf", "Inter", "normal", "700");
    progress(0.15);
    pdf.addFont("/fonts/Inter-ExtraBold.ttf", "Inter", "normal", "800");
    progress(0.16);
    await new Promise((res) => setTimeout(res, 0));
    pdf.addFont("/fonts/Inter-Regular.ttf", "Inter", "normal", "400");
    progress(0.18);
    await new Promise((res) => setTimeout(res, 0));
    if (getTextRenderingOptions()) {
      pdf.addFont(
        "/fonts/NotoSansEthiopic-Regular.ttf",
        "Noto Sans Ethiopic",
        "normal",
        "400",
      );
      pdf.addFont(
        "/fonts/NotoSansEthiopic-ExtraBold.ttf",
        "Noto Sans Ethiopic",
        "normal",
        "800",
      );
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    for (
      let i_item = 0;
      i_item < resReportDetail.data.itemIdsInOrder.length;
      i_item++
    ) {
      currentSlideNumber = i_item + 1;
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
        pdfScaleFactor,
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      const offscreenCanvas = document.createElement("canvas");
      // Use the original canvas dimensions for accurate text measurement
      offscreenCanvas.width = _GLOBAL_CANVAS_PIXEL_WIDTH;
      offscreenCanvas.height = Math.round(
        (_GLOBAL_CANVAS_PIXEL_WIDTH * pdfH) / pdfW,
      );
      const offscreenCtx = offscreenCanvas.getContext("2d")!;

      // Apply the PDF scale factor to the context
      offscreenCtx.scale(pdfScaleFactor, pdfScaleFactor);

      // Ensure fonts are loaded
      offscreenCtx.font = "16px Inter";

      function createCanvas(w: number, h: number) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        return tempCanvas;
      }

      const rc = new PdfRenderContext(pdf, offscreenCtx, createCanvas);
      const rcd = new RectCoordsDims([0, 0, pdfW, pdfH]);
      await PageRenderer.measureAndRender(
        rc,
        rcd,
        resPageInputs.data.pageInputs,
        pdfScaleFactor,
      );
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(1);
    pdf.save("report.pdf");
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
