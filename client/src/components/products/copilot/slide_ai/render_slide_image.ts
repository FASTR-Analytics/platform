import {
  CanvasRenderContext,
  createCanvasBrowser,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { Slide, SlideDeckConfig } from "lib";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { encodeToolImage, type ToolImage } from "../_shared/mod.ts";
import {
  buildSlidePage,
  describeSlideOverflow,
  measurePageOverflow,
} from "./measure_slide_overflow.ts";

// A page paints its own ground. White is what shows where it paints none, as
// on the canvas.
const SLIDE_GROUND = "#ffffff";

// A slide as the PDF export draws its page, for the model to look at. A
// content slide also says whether it overflows the page, measured on the page
// drawn, since the image alone cannot show it.
export async function renderSlideImage(
  slideId: string,
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<{ toolImage: ToolImage; overflowLine: string | undefined }> {
  const page = await buildSlidePage(slide, deckConfig);
  const toolImage = await encodeToolImage((widthPx) => {
    const pxPerDu = widthPx / PAGE_WIDTH_DU;
    const canvas = createCanvasBrowser(
      widthPx,
      Math.round(PAGE_HEIGHT_DU * pxPerDu),
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D canvas context");
    ctx.setTransform(pxPerDu, 0, 0, pxPerDu, 0, 0);
    PageRenderer.measureAndRender(
      new CanvasRenderContext(ctx, createCanvasBrowser),
      new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
      page,
    );
    return canvas;
  }, SLIDE_GROUND);
  const overflowLine = slide.type === "content"
    ? describeSlideOverflow(`Slide ${slideId}`, measurePageOverflow(page))
    : undefined;
  return { toolImage, overflowLine };
}
