// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Color,
  type FigureInputs,
  FigureRenderer,
  getColor,
  ImageRenderer,
  MarkdownRenderer,
  type MeasuredFreeformPage,
  type MeasuredLayoutNode,
  type MeasuredText,
  Padding,
  type PageContentItem,
  type RenderContext,
  sum,
  walkLayout,
} from "./deps.ts";
import type {
  CreateCanvasRenderContext,
  PptxGenJSInstance,
  PptxSlide,
} from "./types.ts";
import {
  pixelsToInches,
  pixelsToPoints,
  rcdToSlidePosition,
} from "./pptx_units.ts";
import { addMeasuredMarkdownToSlide } from "./text_to_pptx.ts";

export function renderFreeformSlide(
  rc: RenderContext,
  pptx: PptxGenJSInstance,
  measured: MeasuredFreeformPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const slide = pptx.addSlide() as unknown as PptxSlide;
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.mergedPageStyle;

  // Background
  if (s.content.backgroundColor !== "none") {
    const bgColor = getColor(s.content.backgroundColor);
    slide.addShape("rect", {
      x: 0,
      y: 0,
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(bounds.h()),
      fill: { color: Color.toHexNoHash(bgColor) },
      line: { color: Color.toHexNoHash(bgColor), width: 0 },
    });
  }

  // Render header
  if (measured.header) {
    renderHeader(slide, measured, s);
  }

  // Render footer
  if (measured.footer) {
    renderFooter(slide, measured, s);
  }

  // Render content
  renderContent(rc, slide, measured, createCanvasRenderContext);

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

function renderHeader(
  slide: PptxSlide,
  measured: MeasuredFreeformPage,
  s: import("./deps.ts").MergedPageStyle,
): void {
  const header = measured.header!;
  const inputs = measured.item;
  const padHeader = new Padding(s.header.padding);

  // Header background
  if (s.header.backgroundColor !== "none") {
    const headerBgColor = getColor(s.header.backgroundColor);
    slide.addShape("rect", {
      ...rcdToSlidePosition(header.rcdHeaderOuter),
      fill: { color: Color.toHexNoHash(headerBgColor) },
      line: { color: Color.toHexNoHash(headerBgColor), width: 0 },
    });
  }

  // Header overlay image (covers header area, matching PDF behavior)
  if (inputs.overlay) {
    const overlayFinalWidth = header.rcdHeaderOuter.w();
    const overlayFinalHeight = overlayFinalWidth *
      (inputs.overlay.height / inputs.overlay.width);
    if (overlayFinalHeight > header.rcdHeaderOuter.h()) {
      const overlayFinalYOffset = overlayFinalHeight -
        header.rcdHeaderOuter.h();
      slide.addImage({
        data: inputs.overlay.src,
        x: pixelsToInches(header.rcdHeaderOuter.x()),
        y: pixelsToInches(header.rcdHeaderOuter.y() - overlayFinalYOffset),
        w: pixelsToInches(overlayFinalWidth),
        h: pixelsToInches(overlayFinalHeight),
      });
    } else {
      const finalHeight = header.rcdHeaderOuter.h();
      const finalWidth = finalHeight *
        (inputs.overlay.width / inputs.overlay.height);
      const xOffset = (finalWidth - header.rcdHeaderOuter.w()) / 2;
      slide.addImage({
        data: inputs.overlay.src,
        x: pixelsToInches(header.rcdHeaderOuter.x() - xOffset),
        y: pixelsToInches(header.rcdHeaderOuter.y()),
        w: pixelsToInches(finalWidth),
        h: pixelsToInches(finalHeight),
      });
    }
  }

  const paddedHeader = header.rcdHeaderOuter.getPadded(padHeader);
  const x = paddedHeader.x();
  const containerW = paddedHeader.w();
  let currentY = paddedHeader.y() + header.yOffsetHeader;

  // Left-placed header logos
  if (
    s.header.logoPlacement === "left" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = x;
    for (const logo of inputs.headerLogos) {
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      slide.addImage({
        data: logo.src,
        x: pixelsToInches(currentX),
        y: pixelsToInches(currentY),
        w: pixelsToInches(logoWidth),
        h: pixelsToInches(s.header.logoHeight),
      });
      currentX += logoWidth + s.header.logoGapX;
    }
    currentY += s.header.logoHeight + s.header.logoBottomPadding;
  }

  // Header text
  if (header.mHeader) {
    addMeasuredTextToSlide(
      slide,
      header.mHeader,
      x,
      currentY,
      containerW,
      "left",
    );
    currentY += header.mHeader.dims.h() + s.header.headerBottomPadding;
  }

  // SubHeader text
  if (header.mSubHeader) {
    addMeasuredTextToSlide(
      slide,
      header.mSubHeader,
      x,
      currentY,
      containerW,
      "left",
    );
    currentY += header.mSubHeader.dims.h() + s.header.subHeaderBottomPadding;
  }

  // Date text
  if (header.mDate) {
    addMeasuredTextToSlide(
      slide,
      header.mDate,
      x,
      currentY,
      containerW,
      "left",
    );
  }

  // Right-placed header logos
  if (
    s.header.logoPlacement === "right" &&
    inputs.headerLogos &&
    inputs.headerLogos.length > 0
  ) {
    let currentX = paddedHeader.rightX();
    const y = paddedHeader.y() + header.yOffsetRightPlacementLogos;
    for (const logo of inputs.headerLogos) {
      const logoWidth = (s.header.logoHeight * logo.width) / logo.height;
      slide.addImage({
        data: logo.src,
        x: pixelsToInches(currentX - logoWidth),
        y: pixelsToInches(y),
        w: pixelsToInches(logoWidth),
        h: pixelsToInches(s.header.logoHeight),
      });
      currentX -= logoWidth + s.header.logoGapX;
    }
  }

  // Header bottom border
  if (s.header.bottomBorderStrokeWidth > 0) {
    slide.addShape("line", {
      x: pixelsToInches(header.rcdHeaderOuter.x()),
      y: pixelsToInches(
        header.rcdHeaderOuter.bottomY() - s.header.bottomBorderStrokeWidth / 2,
      ),
      w: pixelsToInches(header.rcdHeaderOuter.w()),
      h: 0,
      line: {
        color: Color.toHexNoHash(getColor(s.header.bottomBorderColor)),
        width: pixelsToPoints(s.header.bottomBorderStrokeWidth),
      },
    });
  }
}

function renderFooter(
  slide: PptxSlide,
  measured: MeasuredFreeformPage,
  s: import("./deps.ts").MergedPageStyle,
): void {
  const footer = measured.footer!;
  const inputs = measured.item;
  const padFooter = new Padding(s.footer.padding);

  // Footer background (if different from content)
  if (
    s.footer.backgroundColor !== "none" &&
    s.footer.backgroundColor !== s.content.backgroundColor
  ) {
    const footerBgColor = getColor(s.footer.backgroundColor);
    slide.addShape("rect", {
      ...rcdToSlidePosition(footer.rcdFooterOuter),
      fill: { color: Color.toHexNoHash(footerBgColor) },
      line: { color: Color.toHexNoHash(footerBgColor), width: 0 },
    });
  }

  const paddedRcd = footer.rcdFooterOuter.getPadded(padFooter);

  // Footer text
  if (footer.mFooter) {
    addMeasuredTextToSlide(
      slide,
      footer.mFooter,
      paddedRcd.x(),
      paddedRcd.y(),
      paddedRcd.w(),
      "left",
    );
  }

  // Footer logos (right-aligned)
  if (inputs.footerLogos && inputs.footerLogos.length > 0) {
    const logosWidth = sum(
      inputs.footerLogos.map(
        (logo) => (s.footer.logoHeight * logo.width) / logo.height,
      ),
    ) + s.footer.logoGapX * (inputs.footerLogos.length - 1);

    let currentX = paddedRcd.rightX() - logosWidth;
    const y = paddedRcd.y() + (paddedRcd.h() - s.footer.logoHeight) / 2;

    for (const logo of inputs.footerLogos) {
      const logoWidth = (s.footer.logoHeight * logo.width) / logo.height;
      slide.addImage({
        data: logo.src,
        x: pixelsToInches(currentX),
        y: pixelsToInches(y),
        w: pixelsToInches(logoWidth),
        h: pixelsToInches(s.footer.logoHeight),
      });
      currentX += logoWidth + s.footer.logoGapX;
    }
  }
}

function renderContent(
  rc: RenderContext,
  slide: PptxSlide,
  measured: MeasuredFreeformPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  // Walk layout and render container styles + content items
  // Note: renderContainerStyle is called for ALL nodes (row, col, item)
  // to match the PDF renderer behavior
  walkLayout(measured.mLayout, (node: MeasuredLayoutNode<PageContentItem>) => {
    renderContainerStyle(slide, node);
    if (node.type === "item") {
      addContentItem(rc, slide, node, createCanvasRenderContext);
    }
  });

  // Page number
  const inputs = measured.item;
  const s = measured.mergedPageStyle;
  if (inputs.pageNumber) {
    const padContent = new Padding(s.content.padding);
    const paddedContent = measured.rcdContentOuter.getPadded(padContent);
    const mText = rc.mText(
      inputs.pageNumber,
      s.text.pageNumber,
      measured.rcdContentOuter.w() * 0.3,
    );
    slide.addText(inputs.pageNumber, {
      x: pixelsToInches(paddedContent.rightX() - mText.dims.w()),
      y: pixelsToInches(paddedContent.bottomY() - mText.dims.h()),
      w: pixelsToInches(mText.dims.w()),
      h: pixelsToInches(mText.dims.h()),
      fontFace: mText.ti.font.fontFamily,
      fontSize: pixelsToPoints(mText.ti.fontSize),
      color: Color.toHexNoHash(mText.ti.color),
      align: "right",
      valign: "bottom",
      margin: 0,
    });
  }
}

function renderContainerStyle(
  slide: PptxSlide,
  node: MeasuredLayoutNode<PageContentItem>,
): void {
  if (node.type !== "item") return;
  const style = node.style;
  if (!style) return;

  const hasBackground = style.backgroundColor &&
    style.backgroundColor !== "none";
  const hasBorder = style.borderColor &&
    style.borderColor !== "none" &&
    style.borderWidth &&
    style.borderWidth > 0;

  if (!hasBackground && !hasBorder) return;

  // Inset by half border width so stroke is drawn fully inside bounds
  const borderWidth = style.borderWidth ?? 0;
  const inset = borderWidth / 2;
  const insetPad = new Padding(inset);
  const renderBounds = node.rpd.getPadded(insetPad);

  const pos = rcdToSlidePosition(renderBounds);

  const borderWidthPts = pixelsToPoints(borderWidth);

  if (hasBackground && hasBorder) {
    slide.addShape("rect", {
      ...pos,
      fill: { color: Color.toHexNoHash(getColor(style.backgroundColor!)) },
      line: {
        color: Color.toHexNoHash(getColor(style.borderColor!)),
        width: borderWidthPts,
      },
    });
  } else if (hasBackground) {
    slide.addShape("rect", {
      ...pos,
      fill: { color: Color.toHexNoHash(getColor(style.backgroundColor!)) },
      line: { width: 0 },
    });
  } else {
    slide.addShape("rect", {
      ...pos,
      fill: { type: "none" },
      line: {
        color: Color.toHexNoHash(getColor(style.borderColor!)),
        width: borderWidthPts,
      },
    });
  }
}

function addContentItem(
  rc: RenderContext,
  slide: PptxSlide,
  node: MeasuredLayoutNode<PageContentItem> & { type: "item" },
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const item = node.data;
  const bounds = node.contentRpd;

  // Markdown: measure and convert to PPTX
  if (MarkdownRenderer.isType(item)) {
    const mMarkdown = MarkdownRenderer.measure(rc, bounds, item);
    addMeasuredMarkdownToSlide(slide, mMarkdown, bounds);
    return;
  }

  // Figure: rasterize at exact measured dimensions (same as PDF)
  if (FigureRenderer.isType(item)) {
    const {
      canvas,
      rc: figureRc,
      rcd,
    } = createCanvasRenderContext(bounds.w(), bounds.h());
    FigureRenderer.measureAndRender(figureRc, rcd, item as FigureInputs);
    slide.addImage({
      data: canvas.toDataURL("png"),
      ...rcdToSlidePosition(bounds),
    });
    return;
  }

  // Image: measure to get fitted dimensions, then add to slide
  // Note: cover mode with source cropping is not supported in PPTX (falls back to fill behavior)
  if (ImageRenderer.isType(item)) {
    const imageItem = item as import("./deps.ts").ImageInputs;
    if (typeof imageItem.image === "string") {
      const measured = ImageRenderer.measure(rc, bounds, imageItem);
      slide.addImage({
        data: imageItem.image,
        x: pixelsToInches(measured.drawX),
        y: pixelsToInches(measured.drawY),
        w: pixelsToInches(measured.drawW),
        h: pixelsToInches(measured.drawH),
      });
    }
    return;
  }

  // Spacers are ignored - they just affect layout
}

function addMeasuredTextToSlide(
  slide: PptxSlide,
  mText: MeasuredText,
  x: number,
  y: number,
  containerW: number,
  align: "left" | "center" | "right",
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

  // Use container width to avoid font metric differences causing unwanted wrapping
  slide.addText(text, {
    x: pixelsToInches(x),
    y: pixelsToInches(y),
    w: pixelsToInches(containerW),
    h: pixelsToInches(h),
    fontFace: ti.font.fontFamily,
    fontSize: pixelsToPoints(ti.fontSize),
    color: Color.toHexNoHash(ti.color),
    bold: ti.font.weight >= 700,
    italic: ti.font.italic ?? false,
    align,
    valign: "top",
    margin: 0,
    lineSpacingMultiple,
    ...(charSpacing !== undefined ? { charSpacing } : {}),
  });
}
