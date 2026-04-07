// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Color,
  type MeasuredPage,
  type MeasuredText,
  type MergedPageStyle,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import type {
  CreateCanvasRenderContext,
  PptxGenJSInstance,
  PptxSlide,
} from "./types.ts";
import { pixelsToInches, pixelsToPoints } from "./pptx_units.ts";
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
  let slide: PptxSlide;
  switch (measured.type) {
    case "cover":
      slide = renderCoverSlide(rc, pptx, measured, createCanvasRenderContext);
      break;
    case "section":
      slide = renderSectionSlide(rc, pptx, measured, createCanvasRenderContext);
      break;
    case "freeform":
      slide = renderFreeformSlide(
        rc,
        pptx,
        measured,
        createCanvasRenderContext,
      );
      break;
  }

  if (measured.item.pageNumber) {
    const s = measured.mergedPageStyle;
    const pad = s.pageNumber.padding;
    const mText = rc.mText(
      measured.item.pageNumber,
      s.text.pageNumber,
      measured.bounds.w() * 0.3,
    );

    const [x, alignH] = s.pageNumber.placement === "bottom-left"
      ? [measured.bounds.x() + pad.pl(), "left" as const]
      : s.pageNumber.placement === "bottom-center"
      ? [measured.bounds.centerX() - mText.dims.w() / 2, "center" as const]
      : [
        measured.bounds.rightX() - pad.pr() - mText.dims.w(),
        "right" as const,
      ];

    if (s.pageNumber.background !== "none") {
      renderPptxPageNumberBackground(slide, s, mText, x, measured);
    }

    slide.addText(measured.item.pageNumber, {
      x: pixelsToInches(x),
      y: pixelsToInches(
        measured.bounds.bottomY() - pad.pb() - mText.dims.h(),
      ),
      w: pixelsToInches(mText.dims.w()),
      h: pixelsToInches(mText.dims.h()),
      fontFace: mText.ti.font.fontFamily,
      fontSize: pixelsToPoints(mText.ti.fontSize),
      color: Color.toHexNoHash(mText.ti.color),
      align: alignH,
      valign: "bottom",
      margin: 0,
    });
  }
}

function renderPptxPageNumberBackground(
  slide: PptxSlide,
  s: MergedPageStyle,
  mText: MeasuredText,
  textX: number,
  measured: MeasuredPage,
): void {
  const bg = s.pageNumber.background;
  const bgColor = Color.toHexNoHash(s.pageNumber.backgroundColor);
  const pad = s.pageNumber.padding;
  const textW = mText.dims.w();
  const textH = mText.dims.h();
  const bgPadH = textH * 0.4;
  const bgPadV = textH * 0.3;
  const textY = measured.bounds.bottomY() - pad.pb() - textH;

  const rectLeft = textX - bgPadH;
  const rectTop = textY - bgPadV;
  const rectW = textW + bgPadH * 2;
  const rectH = textH + bgPadV * 2;

  if (bg === "triangle") {
    const placement = s.pageNumber.placement;
    if (placement === "bottom-center") {
      slide.addShape("rect", {
        x: pixelsToInches(rectLeft),
        y: pixelsToInches(rectTop),
        w: pixelsToInches(rectW),
        h: pixelsToInches(rectH),
        fill: { color: bgColor },
        line: { width: 0 },
      });
      return;
    }
    const triSize = Math.max(rectW, rectH) * 3;
    const pageBottom = measured.bounds.bottomY();
    slide.addShape("rtTriangle", {
      x: pixelsToInches(
        placement === "bottom-right"
          ? measured.bounds.rightX() - triSize
          : measured.bounds.x(),
      ),
      y: pixelsToInches(pageBottom - triSize),
      w: pixelsToInches(triSize),
      h: pixelsToInches(triSize),
      fill: { color: bgColor },
      line: { width: 0 },
      flipH: placement === "bottom-right",
    });
  } else if (bg === "circle") {
    slide.addShape("roundRect", {
      x: pixelsToInches(rectLeft),
      y: pixelsToInches(rectTop),
      w: pixelsToInches(rectW),
      h: pixelsToInches(rectH),
      rectRadius: pixelsToInches(rectH / 2),
      fill: { color: bgColor },
      line: { width: 0 },
    });
  } else {
    slide.addShape("rect", {
      x: pixelsToInches(rectLeft),
      y: pixelsToInches(rectTop),
      w: pixelsToInches(rectW),
      h: pixelsToInches(rectH),
      fill: { color: bgColor },
      line: { width: 0 },
    });
  }
}
