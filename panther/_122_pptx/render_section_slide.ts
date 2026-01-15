// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, getColor } from "./deps.ts";
import type { MeasuredSectionPage, MeasuredText, RenderContext } from "./deps.ts";
import { pixelsToInches, pixelsToPoints } from "./pptx_units.ts";
import type { PptxGenJSInstance, PptxSlide } from "./types.ts";

export function renderSectionSlide(
  rc: RenderContext,
  pptx: PptxGenJSInstance,
  measured: MeasuredSectionPage,
): void {
  const slide = pptx.addSlide() as unknown as PptxSlide;
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.mergedPageStyle;

  // Background
  if (s.section.backgroundColor !== "none") {
    const bgColor = Color.toHexNoHash(getColor(s.section.backgroundColor));
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(bounds.h()),
      fill: { color: bgColor },
      line: { color: bgColor, width: 0 },
    });
  }

  // Overlay image
  if (item.overlay) {
    slide.addImage({
      data: item.overlay.src,
      x: 0,
      y: 0,
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(bounds.h()),
    });
  }

  // Calculate total height and center vertically (matching PDF render)
  const sectionTitleH = measured.mSectionTitle
    ? measured.mSectionTitle.dims.h()
    : 0;
  const sectionSubTitleH = measured.mSectionSubTitle
    ? measured.mSectionSubTitle.dims.h()
    : 0;

  const totalH = sectionTitleH +
    (sectionSubTitleH > 0 ? sectionSubTitleH + s.section.gapY : 0);
  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  // Render each text element at its measured position
  if (measured.mSectionTitle && sectionTitleH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mSectionTitle,
      bounds.x(),
      bounds.w(),
      currentY,
    );
    currentY += sectionTitleH + s.section.gapY;
  }

  if (measured.mSectionSubTitle && sectionSubTitleH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mSectionSubTitle,
      bounds.x(),
      bounds.w(),
      currentY,
    );
  }

  // Watermark
  if (item.watermark) {
    const mText = rc.mText(item.watermark, s.text.watermark, bounds.w());
    const watermarkColor = new Color(mText.ti.color);
    const alpha = watermarkColor.rgba().a;
    slide.addText(item.watermark, {
      x: pixelsToInches(bounds.x()),
      y: pixelsToInches(bounds.centerY() - mText.dims.h() / 2),
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(mText.dims.h()),
      fontFace: mText.ti.font.fontFamily,
      fontSize: pixelsToPoints(mText.ti.fontSize),
      color: watermarkColor.hexNoHash(),
      transparency: alpha < 1 ? (1 - alpha) * 100 : 0,
      align: "center",
      valign: "middle",
      margin: 0,
    });
  }
}

function addMeasuredTextToSlide(
  slide: PptxSlide,
  mText: MeasuredText,
  boundsX: number,
  boundsW: number,
  y: number,
): void {
  const text = mText.lines.map((line) => line.text).join("\n");
  if (!text.trim()) return;

  const ti = mText.ti;
  const h = mText.dims.h();

  // Use full bounds width with center alignment to avoid font metric differences
  slide.addText(text, {
    x: pixelsToInches(boundsX),
    y: pixelsToInches(y),
    w: pixelsToInches(boundsW),
    h: pixelsToInches(h),
    fontFace: ti.font.fontFamily,
    fontSize: pixelsToPoints(ti.fontSize),
    color: Color.toHexNoHash(ti.color),
    bold: ti.font.weight >= 700,
    italic: ti.font.italic ?? false,
    align: "center",
    valign: "top",
    margin: 0,
  });
}
