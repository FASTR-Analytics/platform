import {
  AIToolFailure,
  createCanvasRenderContextBrowser,
  getFontsForPage,
  loadFontsWithTimeout,
  type MeasuredPage,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { Slide, SlideDeckConfig } from "lib";
import { describeSlideOverflowForAI, PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { slideTextField } from "~/components/products/slide_deck/slide_editor/mod.ts";
import { describeUndrawableTextBlock } from "./layout_structure.ts";

// Whether a slide's page overflows, and where.
export type SlidePageOverflow = Pick<
  MeasuredPage,
  "overflow" | "overflowCauses"
>;

// A slide's page overflow, or the error that kept it from being measured.
export type SlideOverflow = SlidePageOverflow | Error;

export function slidePageOverflow(mPage: MeasuredPage): SlidePageOverflow {
  return { overflow: mPage.overflow, overflowCauses: mPage.overflowCauses };
}

// The page the deck renders for a slide, with the fonts the deck's canvas
// loads for that page, so a measurement here matches the canvas. Every
// measurement of whether a slide overflows the page builds its page here, so
// no two tools can disagree. A text block panther cannot draw is refused in
// the model's terms before the page is built, since panther's own error names
// functions the model cannot call.
export async function buildSlidePage(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<PageInputs> {
  const undrawable = slide.type === "content"
    ? describeUndrawableTextBlock(slide.layout)
    : undefined;
  if (undrawable !== undefined) throw new Error(undrawable);
  const res = await convertSlideToPageInputs(slide, undefined, deckConfig);
  if (!res.success) throw new Error(res.err);
  await loadFontsWithTimeout(getFontsForPage(res.data));
  return res.data;
}

export function toSlideOverflowError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// Whether a slide overflows the page, and where: the flag the deck's canvas
// badges, from the same measurement. Every overflow the model is told comes
// from here or, for a look, from the measurement it draws from. A slide that
// cannot be measured gives its error, so one slide never fails a read of
// several.
export async function measureSlideOverflow(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<SlideOverflow> {
  try {
    return slidePageOverflow(PageRenderer.measure(
      createCanvasRenderContextBrowser(),
      new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
      await buildSlidePage(slide, deckConfig),
    ));
  } catch (err) {
    return toSlideOverflowError(err);
  }
}

// A slide the model built that cannot be measured cannot be drawn on the
// canvas or in the PDF export either, so the call that built it is refused.
export function overflowOrRefuse(overflow: SlideOverflow): SlidePageOverflow {
  if (overflow instanceof Error) {
    throw new AIToolFailure(
      `This slide cannot be drawn: ${overflow.message}. Nothing was changed.`,
    );
  }
  return overflow;
}

// The one sentence every tool gives the model about whether a slide overflows
// the page, and what does not fit. It names no fix: the model decides what to
// change. `slideId` is null for a draft, which has none.
export function describeSlideOverflow(
  slideId: string | null,
  overflow: SlideOverflow,
): string {
  const subject = slideId === null ? "Draft slide" : `Slide ${slideId}`;
  if (overflow instanceof Error) {
    return `${subject}: could not be measured: ${overflow.message}`;
  }
  return overflow.overflow
    ? `${subject}: OVERFLOWS THE PAGE. ${
      describeSlideOverflowForAI(
        overflow.overflowCauses,
        (id) => slideTextField(id)?.field,
      )
    }`
    : `${subject}: fits the page.`;
}
