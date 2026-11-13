import {
  type AIToolImage,
  CanvasRenderContext,
  createCanvasBrowser,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import type { Slide, SlideDeckConfig } from "lib";
import { PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { buildSlidePage } from "./measure_slide_overflow.ts";

// Wide enough for a model to read a dense table's cells, and a quarter of the
// tokens of the page at full size.
const IMAGE_WIDTH_PX = 1024;
const JPEG_QUALITY = 0.85;

// A slide as the PDF export draws its page, as a JPEG for the model to look
// at.
export async function renderSlideImage(
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<AIToolImage> {
  const page = await buildSlidePage(slide, deckConfig);
  const pxPerDu = IMAGE_WIDTH_PX / PAGE_WIDTH_DU;
  const canvas = createCanvasBrowser(
    IMAGE_WIDTH_PX,
    Math.round(PAGE_HEIGHT_DU * pxPerDu),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D canvas context");
  // A JPEG has no transparency: a page that paints no background would
  // come out black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(pxPerDu, 0, 0, pxPerDu, 0, 0);
  PageRenderer.measureAndRender(
    new CanvasRenderContext(ctx, createCanvasBrowser),
    new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
    page,
  );
  return {
    mediaType: "image/jpeg",
    data: canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1],
  };
}
