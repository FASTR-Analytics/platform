import {
  createCanvasRenderContextBrowser,
  loadFontsWithTimeout,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { ContentSlide, Slide, SlideDeckConfig } from "lib";
import {
  getAllSlideFontVariants,
  getSlideDeckThemeSpec,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
} from "lib";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";

// The page the deck renders for a slide. Every measurement of a slide's fit
// builds its page here, so a write's `Page:` line and a read's `overflow`
// cannot disagree.
export async function buildSlidePage(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<PageInputs> {
  const fontFamily = getSlideDeckThemeSpec(deckConfig.theme).fontFamily;
  await loadFontsWithTimeout(getAllSlideFontVariants(fontFamily));
  const res = await convertSlideToPageInputs(slide, undefined, deckConfig);
  if (!res.success) throw new Error(res.err);
  return res.data;
}

// Whether a content slide's layout overflows its page: the flag the deck's
// canvas badges, from the same measurement. A tool that did not just run the
// page optimizer over the slide states page fit from this.
export async function measureSlideOverflow(
  slide: ContentSlide,
  deckConfig: SlideDeckConfig,
): Promise<boolean> {
  return PageRenderer.measure(
    createCanvasRenderContextBrowser(),
    new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
    await buildSlidePage(slide, deckConfig),
  ).overflow;
}
