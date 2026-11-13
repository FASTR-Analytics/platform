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

// The page the deck renders for a slide. Every measurement of whether a slide
// overflows the page builds its page here, so no two tools can disagree.
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

// Whether a content slide overflows the page: the flag the deck's canvas
// badges, from the same measurement. A tool that did not just run the page
// optimizer over the slide measures it here.
export async function measureSlideOverflow(
  slide: ContentSlide,
  deckConfig: SlideDeckConfig,
): Promise<boolean> {
  return measurePageOverflow(await buildSlidePage(slide, deckConfig));
}

export function measurePageOverflow(page: PageInputs): boolean {
  return PageRenderer.measure(
    createCanvasRenderContextBrowser(),
    new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
    page,
  ).overflow;
}

// The one sentence every tool gives the model about whether a content slide
// overflows the page. It names no fix: the model decides what to change.
export function describeSlideOverflow(
  subject: string,
  overflow: boolean,
): string {
  return overflow
    ? `${subject}: OVERFLOWS THE PAGE. Its content does not fit and is cut off at the bottom edge. The slide is broken until it fits.`
    : `${subject}: fits the page.`;
}

export async function describeMeasuredSlideOverflow(
  subject: string,
  slide: ContentSlide,
  deckConfig: SlideDeckConfig,
): Promise<string> {
  return describeSlideOverflow(
    subject,
    await measureSlideOverflow(slide, deckConfig),
  );
}
