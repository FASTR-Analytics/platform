// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type MeasuredPage,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import type { CreateCanvasRenderContext, PptxGenJSInstance } from "./types.ts";
import { renderCoverSlide } from "./render_cover_slide.ts";
import { renderSectionSlide } from "./render_section_slide.ts";
import { renderFreeformSlide } from "./render_freeform_slide.ts";

const DPI = 96;

export function pagesToPptx(
  pptx: PptxGenJSInstance,
  rc: RenderContext,
  pages: PageInputs[],
  createCanvasRenderContext: CreateCanvasRenderContext,
  width: number,
  height: number,
): PptxGenJSInstance {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  // Convert pixels to inches for slide layout
  const slideWidthInches = width / DPI;
  const slideHeightInches = height / DPI;
  pptx.defineLayout({
    name: "CUSTOM",
    width: slideWidthInches,
    height: slideHeightInches,
  });
  pptx.layout = "CUSTOM";

  const bounds = new RectCoordsDims([0, 0, width, height]);

  for (const page of pages) {
    const measured = PageRenderer.measure(rc, bounds, page);
    renderSlideFromMeasured(rc, pptx, measured, createCanvasRenderContext);
  }

  return pptx;
}

function renderSlideFromMeasured(
  rc: RenderContext,
  pptx: PptxGenJSInstance,
  measured: MeasuredPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  switch (measured.type) {
    case "cover":
      renderCoverSlide(rc, pptx, measured);
      break;
    case "section":
      renderSectionSlide(rc, pptx, measured);
      break;
    case "freeform":
      renderFreeformSlide(rc, pptx, measured, createCanvasRenderContext);
      break;
  }
}
