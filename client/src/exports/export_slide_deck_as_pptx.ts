import {
  APIResponseNoData,
  pagesToPptxBrowser,
  PageInputs,
  saveAs,
} from "panther";
import { type Slide, PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { serverActions } from "~/server_actions";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { convertSlideToPageInputs } from "../generate_slide_deck/convert_slide_to_page_inputs";

export async function exportSlideDeckAsPptx(
  deckId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  let currentSlideNumber = 0;
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const resDeckDetail = await serverActions.getSlideDeckDetail({
      deck_id: deckId,
    });

    await new Promise((res) => setTimeout(res, 0));
    progress(0.1);
    if (resDeckDetail.success === false) {
      return resDeckDetail;
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(0.2);

    const pages: PageInputs[] = [];

    for (let i = 0; i < resDeckDetail.data.slideIds.length; i++) {
      currentSlideNumber = i + 1;
      const slideId = resDeckDetail.data.slideIds[i];
      await new Promise((res) => setTimeout(res, 0));
      progress(0.2 + (0.7 * i) / resDeckDetail.data.slideIds.length);

      const resSlide = await getSlideFromCacheOrFetch(slideId);
      if (resSlide.success === false) {
        return resSlide;
      }
      const slide: Slide = resSlide.data.slide;

      const resPageInputs = await convertSlideToPageInputs(
        slide,
        i,
        resDeckDetail.data.config,
      );

      if (resPageInputs.success === false) {
        return resPageInputs;
      }

      pages.push(resPageInputs.data);
    }

    await new Promise((res) => setTimeout(res, 0));
    progress(0.95);

    const pptx = pagesToPptxBrowser(pages, PAGE_WIDTH_DU, PAGE_HEIGHT_DU);
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
