import {
  CanvasRenderContext,
  createCanvasBrowser,
  createCanvasRenderContextBrowser,
  type MeasuredPage,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { Slide, SlideDeckConfig } from "lib";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { encodeToolImage, type ToolImage } from "../_shared/mod.ts";
import {
  buildSlidePage,
  type SlideOverflow,
  slidePageOverflow,
  toSlideOverflowError,
} from "./measure_slide_overflow.ts";

// A page paints its own ground. White is what shows where it paints none, as
// on the canvas.
const SLIDE_GROUND = "#ffffff";

// A slide as the PDF export draws its page, for the model to look at, and
// whether it overflows the page and where, which the image alone cannot
// show. A slide that cannot be measured has no image, and gives its error.
// The page is measured once in page units, so every width the image is drawn
// at draws that one measurement.
export async function renderSlideImage(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<{ toolImage: ToolImage | undefined; overflow: SlideOverflow }> {
  let mPage: MeasuredPage;
  try {
    mPage = PageRenderer.measure(
      createCanvasRenderContextBrowser(),
      new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
      await buildSlidePage(slide, deckConfig),
    );
  } catch (err) {
    return { toolImage: undefined, overflow: toSlideOverflowError(err) };
  }
  const toolImage = encodeToolImage((widthPx) => {
    const pxPerDu = widthPx / PAGE_WIDTH_DU;
    const canvas = createCanvasBrowser(
      widthPx,
      Math.round(PAGE_HEIGHT_DU * pxPerDu),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");
    ctx.setTransform(pxPerDu, 0, 0, pxPerDu, 0, 0);
    PageRenderer.render(
      new CanvasRenderContext(ctx, createCanvasBrowser),
      mPage,
    );
    return canvas;
  }, SLIDE_GROUND);
  return { toolImage, overflow: slidePageOverflow(mPage) };
}
