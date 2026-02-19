// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color, getColor, sum } from "./deps.ts";
import type { MeasuredCoverPage, MeasuredText, RenderContext } from "./deps.ts";
import { imageToDataUrl, pixelsToInches, pixelsToPoints } from "./pptx_units.ts";
import type {
  CreateCanvasRenderContext,
  PptxGenJSInstance,
  PptxSlide,
} from "./types.ts";

export function renderCoverSlide(
  rc: RenderContext,
  pptx: PptxGenJSInstance,
  measured: MeasuredCoverPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const slide = pptx.addSlide() as unknown as PptxSlide;
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.mergedPageStyle;

  // Background
  if (s.cover.backgroundColor !== "none") {
    const bgColor = Color.toHexNoHash(getColor(s.cover.backgroundColor));
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
    const overlayDataUrl = imageToDataUrl(item.overlay, createCanvasRenderContext);
    slide.addImage({
      data: overlayDataUrl,
      x: 0,
      y: 0,
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(bounds.h()),
    });
  }

  // Calculate total height and center vertically (matching PDF render)
  const logoH = item.titleLogos && item.titleLogos.length > 0
    ? s.cover.logoHeight
    : 0;
  const titleH = measured.mTitle ? measured.mTitle.dims.h() : 0;
  const subTitleH = measured.mSubTitle ? measured.mSubTitle.dims.h() : 0;
  const authorH = measured.mAuthor ? measured.mAuthor.dims.h() : 0;
  const dateH = measured.mDate ? measured.mDate.dims.h() : 0;

  let totalH = 0;
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    totalH += logoH + s.cover.gapY;
  }
  if (measured.mTitle && titleH > 0) totalH += titleH + s.cover.gapY;
  if (measured.mSubTitle && subTitleH > 0) totalH += subTitleH + s.cover.gapY;
  if (measured.mAuthor && authorH > 0) totalH += authorH + s.cover.gapY;
  if (measured.mDate && dateH > 0) totalH += dateH + s.cover.gapY;
  totalH -= s.cover.gapY; // Remove last gap

  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  // Title logos
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    const logoWidths = item.titleLogos.map((logo: HTMLImageElement) => {
      return (logoH * logo.width) / logo.height;
    });
    const totalLogoWidths = sum(logoWidths) +
      (logoWidths.length - 1) * s.cover.logoGapX;
    let currentX = bounds.x() + (bounds.w() - totalLogoWidths) / 2;
    for (let i = 0; i < item.titleLogos.length; i++) {
      const logo = item.titleLogos[i];
      const logoDataUrl = imageToDataUrl(logo, createCanvasRenderContext);
      const logoWidth = logoWidths[i];
      slide.addImage({
        data: logoDataUrl,
        x: pixelsToInches(currentX),
        y: pixelsToInches(currentY),
        w: pixelsToInches(logoWidth),
        h: pixelsToInches(logoH),
      });
      currentX += logoWidth + s.cover.logoGapX;
    }
    currentY += logoH + s.cover.gapY;
  }

  // Render each text element at its measured position
  if (measured.mTitle && titleH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mTitle,
      bounds.x(),
      bounds.w(),
      currentY,
    );
    currentY += titleH + s.cover.gapY;
  }

  if (measured.mSubTitle && subTitleH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mSubTitle,
      bounds.x(),
      bounds.w(),
      currentY,
    );
    currentY += subTitleH + s.cover.gapY;
  }

  if (measured.mAuthor && authorH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mAuthor,
      bounds.x(),
      bounds.w(),
      currentY,
    );
    currentY += authorH + s.cover.gapY;
  }

  if (measured.mDate && dateH > 0) {
    addMeasuredTextToSlide(
      slide,
      measured.mDate,
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

  let charSpacing: number | undefined;
  if (ti.letterSpacing.includes("em")) {
    const multiplier = Number(ti.letterSpacing.replaceAll("em", ""));
    if (!isNaN(multiplier) && multiplier !== 0) {
      charSpacing = pixelsToPoints(ti.fontSize * multiplier);
    }
  }
  const lineSpacingMultiple = ti.lineHeight / 1.2;

  // Use full bounds width with center alignment to avoid font metric differences
  // between Skia (measurement) and PowerPoint (rendering) causing premature wrapping
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
    lineSpacingMultiple,
    ...(charSpacing !== undefined ? { charSpacing } : {}),
  });
}
