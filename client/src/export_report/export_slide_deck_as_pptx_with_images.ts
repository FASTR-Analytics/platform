import {
  APIResponseNoData,
  pagesToPptxBrowser,
  PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
  saveAs,
} from "panther";
import type { Slide } from "lib";
import { serverActions } from "~/server_actions";
import { _SLIDE_CACHE } from "~/state/caches/slides";
import { convertSlideToPageInputs } from "~/components/slide_deck/slide_rendering/convert_slide_to_page_inputs";

export async function exportSlideDeckAsPptxWithImages(
  projectId: string,
  deckId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
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

    const canvasW = _GLOBAL_CANVAS_PIXEL_WIDTH;
    const canvasH = Math.round((canvasW * 9) / 16);

    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    const pages: PageInputs[] = [];

    for (
      let i = 0;
      i < resDeckDetail.data.slideIds.length;
      i++
    ) {
      currentSlideNumber = i + 1;
      const slideId = resDeckDetail.data.slideIds[i];
      await new Promise((res) => setTimeout(res, 0));
      progress(
        0.2 + (0.7 * i) / resDeckDetail.data.slideIds.length,
      );

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

      pages.push(resPageInputs.data);
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(0.95);

    const pptx = pagesToPptxBrowser(pages, canvasW, canvasH);
    const blob = (await pptx.write({ outputType: "blob" })) as Blob;
    saveAs(blob, `${resDeckDetail.data.label}.pptx`);

    await new Promise((res) => setTimeout(res, 0));
    progress(1);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err:
        `Error creating slide ${currentSlideNumber}: ` +
        (e instanceof Error ? e.message : ""),
    };
  }
}
