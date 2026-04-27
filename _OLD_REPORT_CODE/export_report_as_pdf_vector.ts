import { ProjectDirtyStates } from "lib";
import {
  APIResponseNoData,
  RectCoordsDims,
  PageRenderer,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  createPdfRenderContextWithFontsBrowser,
  CustomPageStyle,
  type FontInfo,
} from "panther";
import {
  getReportDetailFromCacheOrFetch,
  getPageInputsFromCacheOrFetch,
} from "~/state/ri_cache";
import fontMap from "~/font-map.json";

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

    const pdfW = _GLOBAL_CANVAS_PIXEL_WIDTH;
    const pdfH =
      resReportDetail.data.reportType === "slide_deck"
        ? Math.round((pdfW * 9) / 16)
        : Math.round((pdfW * 297) / 210);

    const pdfOrientation =
      resReportDetail.data.reportType === "slide_deck"
        ? "landscape"
        : "portrait";

    // Get fonts to register from a representative page style
    const _InternationalInter_400: FontInfo = {
      fontFamily: "International Inter",
      weight: 400,
      italic: false,
    };
    const _InternationalInter_800: FontInfo = {
      fontFamily: "International Inter",
      weight: 800,
      italic: false,
    };
    const representativeStyle = new CustomPageStyle({
      text: {
        base: { font: _InternationalInter_400 },
        coverTitle: { font: _InternationalInter_800 },
        sectionTitle: { font: _InternationalInter_800 },
        header: { font: _InternationalInter_800 },
      },
    });
    const fonts: FontInfo[] = representativeStyle.getFontsToRegister();

    progress(0.15);

    const { pdf, rc } = await createPdfRenderContextWithFontsBrowser(
      pdfW,
      pdfH,
      fonts,
      { basePath: "/fonts", fontMap: fontMap.ttf },
    );

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
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      const rcd = new RectCoordsDims([0, 0, pdfW, pdfH]);
      await PageRenderer.measureAndRender(
        rc,
        rcd,
        resPageInputs.data.pageInputs,
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
