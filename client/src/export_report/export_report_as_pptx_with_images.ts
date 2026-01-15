import PptxGenJS from "pptxgenjs";
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

export async function exportReportAsPptxWithImages(
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

    const pdfW = Math.round(canvasW * pdfResolution);
    const pdfH = Math.round(canvasH * pdfResolution);

    // Create PPTX presentation
    const pres = new PptxGenJS();

    // Define custom layout based on report dimensions
    const _LAYOUT_NAME = "custom_layout";
    const _STANDARD_PPTX_WIDTH_INCHES = 10;
    const heightToWidthRatio = canvasH / canvasW;

    pres.defineLayout({
      name: _LAYOUT_NAME,
      width: _STANDARD_PPTX_WIDTH_INCHES,
      height: _STANDARD_PPTX_WIDTH_INCHES * heightToWidthRatio,
    });
    pres.layout = _LAYOUT_NAME;

    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    // Generate and add each page as a slide
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

      const resPageInputs = await getPageInputsFromCacheOrFetch(
        projectId,
        reportId,
        reportItemId,
        pdfResolution,
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      // Create offscreen canvas for rendering
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = pdfW;
      offscreenCanvas.height = pdfH;
      const offscreenCtx = offscreenCanvas.getContext("2d")!;

      // Render the page content
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

      // Add slide with rendered image
      const slide = pres.addSlide();
      const imageDataUrl = offscreenCanvas.toDataURL("image/png");
      slide.addImage({
        data: imageDataUrl,
        x: 0,
        y: 0,
        w: "100%",
        h: "100%",
      });
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(1);

    // Save the PPTX file
    await pres.writeFile({ fileName: "report.pptx" });

    return { success: true };
  } catch (error) {
    console.error("Error creating PPTX:", error);
    return { success: false, err: "Error creating PPTX report" };
  }
}