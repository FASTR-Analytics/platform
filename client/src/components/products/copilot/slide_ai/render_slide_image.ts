import {
  CanvasRenderContext,
  createCanvasBrowser,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { Slide, SlideDeckConfig } from "lib";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { encodeToolImage, type ToolImage } from "../_shared/mod.ts";
import { buildSlidePage } from "./measure_slide_overflow.ts";

// A page paints its own ground. White is what shows where it paints none, as
// on the canvas.
const SLIDE_GROUND = "#ffffff";

// A slide as the PDF export draws its page, for the model to look at.
export async function renderSlideImage(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<ToolImage> {
  const page = await buildSlidePage(slide, deckConfig);
  return encodeToolImage((widthPx) => {
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
}
