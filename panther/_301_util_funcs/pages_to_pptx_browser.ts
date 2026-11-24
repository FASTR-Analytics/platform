// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildCanvasRenderContext,
  type CreateCanvasRenderContext,
  type PageInputs,
  pagesToPptx,
  PptxGenJS,
  type PptxGenJSInstance,
  type SlideExportSizeOptions,
} from "./deps.ts";
import { createCanvasBrowser } from "./create_canvas_render_context_browser.ts";

const PptxGenJSConstructor = PptxGenJS as unknown as {
  new (): PptxGenJSInstance;
};

export function pagesToPptxBrowser(
  pages: PageInputs[],
  opts: SlideExportSizeOptions,
): PptxGenJSInstance {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const createCanvasRenderContext: CreateCanvasRenderContext = (
    w,
    h,
    devicePxPerDu,
  ) => buildCanvasRenderContext(createCanvasBrowser, w, h, devicePxPerDu);

  const pptx = new PptxGenJSConstructor() as PptxGenJSInstance;
  const { rc } = createCanvasRenderContext(100, 100, 1);

  return pagesToPptx(pptx, rc, pages, createCanvasRenderContext, opts);
}
