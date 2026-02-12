import {
  RectCoordsDims,
  PageRenderer,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  _GLOBAL_PDF_PIXEL_WIDTH,
  createPdfRenderContextWithFontsBrowser,
  CustomPageStyle,
  type FontInfo,
} from "panther";
import { APIResponseNoData, APIResponseWithData, getTextRenderingOptions, type Slide } from "lib";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { convertSlideToPageInputs } from "~/components/slide_deck/slide_rendering/convert_slide_to_page_inputs";
import fontMap from "~/font-map.json";

/**
 * Same as exportSlideDeckAsPdfVector but returns the PDF as a base64 string
 * instead of triggering a download.
 */
export async function exportSlideDeckAsPdfBase64(
  projectId: string,
  deckId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData | APIResponseWithData<string>> {
  let currentSlideNumber = 0;
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const resDeckDetail = await serverActions.getSlideDeckDetail({
      projectId,
      deck_id: deckId,
    });

    await new Promise((res) => setTimeout(res, 0));
    progress(0.1);
    if (resDeckDetail.success === false) {
      return resDeckDetail;
    }

    const pdfScaleFactor = _GLOBAL_PDF_PIXEL_WIDTH / _GLOBAL_CANVAS_PIXEL_WIDTH;
    const pdfW = _GLOBAL_PDF_PIXEL_WIDTH;
    const pdfH = Math.round((pdfW * 9) / 16);
    const pdfOrientation = "landscape";

    const _Inter_400: FontInfo = {
      fontFamily: "Inter",
      weight: 400,
      italic: false,
    };
    const _Inter_800: FontInfo = {
      fontFamily: "Inter",
      weight: 800,
      italic: false,
    };
    const representativeStyle = new CustomPageStyle({
      text: {
        base: { font: _Inter_400 },
        coverTitle: { font: _Inter_800 },
        sectionTitle: { font: _Inter_800 },
        header: { font: _Inter_800 },
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

    progress(0.2);

    for (
      let i = 0;
      i < resDeckDetail.data.slideIds.length;
      i++
    ) {
      currentSlideNumber = i + 1;
      const slideId = resDeckDetail.data.slideIds[i];
      await new Promise((res) => setTimeout(res, 0));
      progress(
        0.2 + (0.8 * i) / resDeckDetail.data.slideIds.length,
      );
      if (i > 0) {
        pdf.addPage([pdfW, pdfH], pdfOrientation);
      }

      const cached = await _SLIDE_CACHE.get({ projectId, slideId });
      let slide: Slide;

      if (!cached.data) {
        const res = await serverActions.getSlide({ projectId, slide_id: slideId });
        if (res.success === false) {
          return res;
        }
        slide = res.data.slide;
      } else {
        slide = cached.data.slide;
      }

      const resPageInputs = await convertSlideToPageInputs(projectId, slide, i, resDeckDetail.data.config);

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      const rcd = new RectCoordsDims([0, 0, pdfW, pdfH]);
      await PageRenderer.measureAndRender(
        rc,
        rcd,
        resPageInputs.data,
        pdfScaleFactor,
      );
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(1);

    // Return base64 instead of saving to disk
    const base64 = pdf.output("datauristring").split(",")[1];
    return { success: true, data: base64 };
  } catch (e) {
    return {
      success: false,
      err:
        `Error creating slide ${currentSlideNumber}: ` +
        (e instanceof Error ? e.message : ""),
    };
  }
}
