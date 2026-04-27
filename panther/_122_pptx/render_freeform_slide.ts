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
  measureLogos,
  type MeasuredFreeformPage,
  type MeasuredLayoutNode,
  type MeasuredText,
  Padding,
  type PageContentItem,
  RectCoordsDims,
  type RenderContext,
  walkLayout,
} from "./deps.ts";
import type {
  CreateCanvasRenderContext,
  PptxGenJSInstance,
  PptxSlide,
} from "./types.ts";
import {
  imageToDataUrl,
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
): PptxSlide {
  const slide = pptx.addSlide() as unknown as PptxSlide;
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.style;

  // Background
  if (s.content.background !== "none") {
    const bgColor = getColor(s.content.background);
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
    renderHeader(slide, measured, s, createCanvasRenderContext);
  }

  // Render footer
  if (measured.footer) {
    renderFooter(slide, measured, s, createCanvasRenderContext);
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

  return slide;
}

function renderHeader(
  slide: PptxSlide,
  measured: MeasuredFreeformPage,
  s: import("./deps.ts").MergedFreeformStyle,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const header = measured.header!;
  const inputs = measured.item;
  const padHeader = new Padding(s.header.padding);

  // Header background
  if (s.header.background !== "none") {
    const headerBgColor = getColor(s.header.background);
    slide.addShape("rect", {
      ...rcdToSlidePosition(header.rcdHeaderOuter),
      fill: { color: Color.toHexNoHash(headerBgColor) },
      line: { color: Color.toHexNoHash(headerBgColor), width: 0 },
    });
  }

  // Header overlay image (covers header area, matching PDF behavior)
  if (inputs.overlay) {
    const overlayDataUrl = imageToDataUrl(
      inputs.overlay,
      createCanvasRenderContext,
    );
    const overlayFinalWidth = header.rcdHeaderOuter.w();
    const overlayFinalHeight =
      overlayFinalWidth * (inputs.overlay.height / inputs.overlay.width);
    if (overlayFinalHeight > header.rcdHeaderOuter.h()) {
      const overlayFinalYOffset =
        overlayFinalHeight - header.rcdHeaderOuter.h();
      slide.addImage({
        data: overlayDataUrl,
        x: pixelsToInches(header.rcdHeaderOuter.x()),
        y: pixelsToInches(header.rcdHeaderOuter.y() - overlayFinalYOffset),
        w: pixelsToInches(overlayFinalWidth),
        h: pixelsToInches(overlayFinalHeight),
      });
    } else {
      const finalHeight = header.rcdHeaderOuter.h();
      const finalWidth =
        finalHeight * (inputs.overlay.width / inputs.overlay.height);
      const xOffset = (finalWidth - header.rcdHeaderOuter.w()) / 2;
      slide.addImage({
        data: overlayDataUrl,
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

  // Header logos (always right-aligned)
  if (inputs.headerLogos && inputs.headerLogos.length > 0) {
    const logoBounds = new RectCoordsDims([
      paddedHeader.x(),
      paddedHeader.y() + header.yOffsetRightPlacementLogos,
      paddedHeader.w(),
      10000,
    ]);
    const mLogos = measureLogos(logoBounds, {
      images: inputs.headerLogos,
      style: s.header.logosSizing,
      alignH: "right",
      alignV: "top",
    });
    for (const logo of mLogos.items) {
      const logoDataUrl = imageToDataUrl(logo.image, createCanvasRenderContext);
      slide.addImage({
        data: logoDataUrl,
        x: pixelsToInches(logo.x),
        y: pixelsToInches(logo.y),
        w: pixelsToInches(logo.width),
        h: pixelsToInches(logo.height),
      });
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
  s: import("./deps.ts").MergedFreeformStyle,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const footer = measured.footer!;
  const inputs = measured.item;
  const padFooter = new Padding(s.footer.padding);

  // Footer background (if different from content)
  if (
    s.footer.background !== "none" &&
    s.footer.background !== s.content.background
  ) {
    const footerBgColor = getColor(s.footer.background);
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
    const mLogos = measureLogos(paddedRcd, {
      images: inputs.footerLogos,
      style: s.footer.logosSizing,
      alignH: "right",
      alignV: "middle",
    });
    for (const logo of mLogos.items) {
      const logoDataUrl = imageToDataUrl(logo.image, createCanvasRenderContext);
      slide.addImage({
        data: logoDataUrl,
        x: pixelsToInches(logo.x),
        y: pixelsToInches(logo.y),
        w: pixelsToInches(logo.width),
        h: pixelsToInches(logo.height),
      });
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
}

function renderContainerStyle(
  slide: PptxSlide,
  node: MeasuredLayoutNode<PageContentItem>,
): void {
  if (node.type !== "item") return;
  const rs = node.resolvedStyle;

  const hasBackground = rs.backgroundColor !== "none";
  const hasBorder = rs.borderColor !== "none" && rs.borderWidth > 0;

  if (!hasBackground && !hasBorder) return;

  const renderBounds = node.styleRpd;

  const pos = rcdToSlidePosition(renderBounds);

  const borderWidthPts = pixelsToPoints(rs.borderWidth);

  const shapeType = rs.rectRadius > 0 ? "roundRect" : "rect";
  const radiusOpts =
    rs.rectRadius > 0
      ? {
          rectRadius: Math.min(
            rs.rectRadius / (Math.min(renderBounds.w(), renderBounds.h()) / 2),
            1,
          ),
        }
      : {};

  if (hasBackground && hasBorder) {
    slide.addShape(shapeType, {
      ...pos,
      ...radiusOpts,
      fill: { color: Color.toHexNoHash(rs.backgroundColor) },
      line: {
        color: Color.toHexNoHash(rs.borderColor),
        width: borderWidthPts,
      },
    });
  } else if (hasBackground) {
    slide.addShape(shapeType, {
      ...pos,
      ...radiusOpts,
      fill: { color: Color.toHexNoHash(rs.backgroundColor) },
      line: { width: 0 },
    });
  } else {
    slide.addShape(shapeType, {
      ...pos,
      ...radiusOpts,
      fill: { type: "none" },
      line: {
        color: Color.toHexNoHash(rs.borderColor),
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
  if (ImageRenderer.isType(item)) {
    const imageItem = item as import("./deps.ts").ImageInputs;
    const measured = ImageRenderer.measure(rc, bounds, imageItem);

    let dataUrl: string;
    if (typeof imageItem.image === "string") {
      dataUrl = imageItem.image;
    } else {
      // Support cover mode with source cropping
      const crop =
        measured.srcX !== undefined &&
        measured.srcY !== undefined &&
        measured.srcW !== undefined &&
        measured.srcH !== undefined
          ? {
              sx: measured.srcX,
              sy: measured.srcY,
              sw: measured.srcW,
              sh: measured.srcH,
            }
          : undefined;
      dataUrl = imageToDataUrl(
        imageItem.image,
        createCanvasRenderContext,
        crop,
      );
    }

    slide.addImage({
      data: dataUrl,
      x: pixelsToInches(measured.drawX),
      y: pixelsToInches(measured.drawY),
      w: pixelsToInches(measured.drawW),
      h: pixelsToInches(measured.drawH),
    });
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
