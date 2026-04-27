// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlignH,
  type AlignV,
  Color,
  getColor,
  type LogosPlacement,
  measureLogos,
  type MeasuredLogos,
  Padding,
  RectCoordsDims,
} from "./deps.ts";
import type {
  MeasuredCoverPage,
  MeasuredText,
  MergedCoverStyle,
  RenderContext,
} from "./deps.ts";
import {
  imageToDataUrl,
  pixelsToInches,
  pixelsToPoints,
} from "./pptx_units.ts";
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
): PptxSlide {
  const slide = pptx.addSlide() as unknown as PptxSlide;
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.style;

  // Background
  if (s.background !== "none") {
    const bgColor = Color.toHexNoHash(getColor(s.background));
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
    const overlayDataUrl = imageToDataUrl(
      item.overlay,
      createCanvasRenderContext,
    );
    slide.addImage({
      data: overlayDataUrl,
      x: 0,
      y: 0,
      w: pixelsToInches(bounds.w()),
      h: pixelsToInches(bounds.h()),
    });
  }

  const hasLogos = item.titleLogos && item.titleLogos.length > 0;
  const isFixed = isFixedPlacement(s.logosPlacement);

  if (hasLogos && isFixed) {
    renderFixedLogosCover(
      slide,
      bounds,
      item.titleLogos!,
      s,
      measured,
      createCanvasRenderContext,
    );
  } else {
    renderFlowCover(
      slide,
      bounds,
      hasLogos ? item.titleLogos : undefined,
      s,
      measured,
      createCanvasRenderContext,
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

  return slide;
}

function isFixedPlacement(p: LogosPlacement): boolean {
  return p.position.startsWith("top-") || p.position.startsWith("bottom-");
}

function renderFixedLogosCover(
  slide: PptxSlide,
  bounds: RectCoordsDims,
  logos: HTMLImageElement[],
  s: MergedCoverStyle,
  measured: MeasuredCoverPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const padding = s.padding;
  const placement = s.logosPlacement;

  const paddedBounds = new RectCoordsDims([
    bounds.x() + padding.pl(),
    bounds.y() + padding.pt(),
    bounds.w() - padding.totalPx(),
    bounds.h() - padding.totalPy(),
  ]);

  const { alignH: logoAlignH, alignV: logoAlignV } =
    getFixedPlacementAlignment(placement);
  const mLogos = measureLogos(paddedBounds, {
    images: logos,
    style: s.logosSizing,
    alignH: logoAlignH,
    alignV: logoAlignV,
  });

  renderLogos(slide, mLogos, createCanvasRenderContext);

  const logoSpace = mLogos.totalHeight + placement.gap;
  const isTop = placement.position.startsWith("top-");

  const contentBounds = isTop
    ? new RectCoordsDims([
        bounds.x(),
        bounds.y() + padding.pt() + logoSpace,
        bounds.w(),
        bounds.h() - padding.pt() - logoSpace,
      ])
    : new RectCoordsDims([
        bounds.x(),
        bounds.y(),
        bounds.w(),
        bounds.h() - padding.pb() - logoSpace,
      ]);

  const contentPadding = isTop
    ? new Padding([0, padding.pr(), padding.pb(), padding.pl()])
    : new Padding([padding.pt(), padding.pr(), 0, padding.pl()]);

  renderContentStack(
    slide,
    contentBounds,
    contentPadding,
    s.alignH,
    s.alignV,
    measured.mTitle,
    measured.mSubTitle,
    measured.mAuthor,
    measured.mDate,
    s.titleBottomPadding,
    s.subTitleBottomPadding,
    s.authorBottomPadding,
  );
}

function renderFlowCover(
  slide: PptxSlide,
  bounds: RectCoordsDims,
  logos: HTMLImageElement[] | undefined,
  s: MergedCoverStyle,
  measured: MeasuredCoverPage,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
  const padding = s.padding;
  const placement = s.logosPlacement;
  const textMaxWidth = bounds.w() - padding.totalPx();

  let mLogos: MeasuredLogos<HTMLImageElement> | undefined;
  if (logos && logos.length > 0) {
    mLogos = measureLogos(new RectCoordsDims([0, 0, textMaxWidth, 10000]), {
      images: logos,
      style: s.logosSizing,
      alignH: "left",
      alignV: "top",
    });
  }

  type StackItem = { type: string; h: number; gap: number };
  const items: StackItem[] = [];

  const addItem = (type: string, h: number, gap: number) => {
    if (h > 0) items.push({ type, h, gap });
  };

  if (placement.position === "above-content" && mLogos) {
    addItem("logo", mLogos.totalHeight, placement.gap);
  }

  addItem("title", measured.mTitle?.dims.h() ?? 0, s.titleBottomPadding);
  addItem("subtitle", measured.mSubTitle?.dims.h() ?? 0, s.subTitleBottomPadding);
  addItem("author", measured.mAuthor?.dims.h() ?? 0, s.authorBottomPadding);
  addItem("date", measured.mDate?.dims.h() ?? 0, 0);

  if (placement.position === "below-content" && mLogos) {
    addItem("logo", mLogos.totalHeight, 0);
  }

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].h;
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  let currentY = getStartY(bounds, padding, s.alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.type === "logo" && mLogos && logos) {
      const positioned = measureLogos(
        new RectCoordsDims([
          bounds.x() + padding.pl(),
          currentY,
          textMaxWidth,
          item.h,
        ]),
        { images: logos, style: s.logosSizing, alignH: s.alignH, alignV: "top" },
      );
      renderLogos(slide, positioned, createCanvasRenderContext);
    } else if (item.type === "title" && measured.mTitle) {
      addTextToSlide(slide, measured.mTitle, bounds, padding, s.alignH, currentY);
    } else if (item.type === "subtitle" && measured.mSubTitle) {
      addTextToSlide(slide, measured.mSubTitle, bounds, padding, s.alignH, currentY);
    } else if (item.type === "author" && measured.mAuthor) {
      addTextToSlide(slide, measured.mAuthor, bounds, padding, s.alignH, currentY);
    } else if (item.type === "date" && measured.mDate) {
      addTextToSlide(slide, measured.mDate, bounds, padding, s.alignH, currentY);
    }

    currentY += item.h;
    if (i < items.length - 1) {
      currentY += item.gap;
    }
  }
}

function renderContentStack(
  slide: PptxSlide,
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
  alignV: AlignV,
  mTitle?: MeasuredText,
  mSubTitle?: MeasuredText,
  mAuthor?: MeasuredText,
  mDate?: MeasuredText,
  titleGap: number = 0,
  subtitleGap: number = 0,
  authorGap: number = 0,
): void {
  type StackItem = { mText: MeasuredText; gap: number };
  const items: StackItem[] = [];

  if (mTitle) items.push({ mText: mTitle, gap: titleGap });
  if (mSubTitle) items.push({ mText: mSubTitle, gap: subtitleGap });
  if (mAuthor) items.push({ mText: mAuthor, gap: authorGap });
  if (mDate) items.push({ mText: mDate, gap: 0 });

  let totalH = 0;
  for (let i = 0; i < items.length; i++) {
    totalH += items[i].mText.dims.h();
    if (i < items.length - 1) {
      totalH += items[i].gap;
    }
  }

  let currentY = getStartY(bounds, padding, alignV, totalH);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    addTextToSlide(slide, item.mText, bounds, padding, alignH, currentY);
    currentY += item.mText.dims.h();
    if (i < items.length - 1) {
      currentY += item.gap;
    }
  }
}

function renderLogos(
  slide: PptxSlide,
  mLogos: MeasuredLogos<HTMLImageElement>,
  createCanvasRenderContext: CreateCanvasRenderContext,
): void {
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

function addTextToSlide(
  slide: PptxSlide,
  mText: MeasuredText,
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
  y: number,
): void {
  const text = mText.lines.map((line) => line.text).join("\n");
  if (!text.trim()) return;

  const ti = mText.ti;
  const h = mText.dims.h();
  const textMaxWidth = bounds.w() - padding.totalPx();

  let charSpacing: number | undefined;
  if (ti.letterSpacing.includes("em")) {
    const multiplier = Number(ti.letterSpacing.replaceAll("em", ""));
    if (!isNaN(multiplier) && multiplier !== 0) {
      charSpacing = pixelsToPoints(ti.fontSize * multiplier);
    }
  }
  const lineSpacingMultiple = ti.lineHeight / 1.2;

  const x =
    alignH === "left"
      ? bounds.x() + padding.pl()
      : alignH === "right"
        ? bounds.x() + bounds.w() - padding.pr() - textMaxWidth
        : bounds.x() + padding.pl();

  slide.addText(text, {
    x: pixelsToInches(x),
    y: pixelsToInches(y),
    w: pixelsToInches(textMaxWidth),
    h: pixelsToInches(h),
    fontFace: ti.font.fontFamily,
    fontSize: pixelsToPoints(ti.fontSize),
    color: Color.toHexNoHash(ti.color),
    bold: ti.font.weight >= 700,
    italic: ti.font.italic ?? false,
    align: alignH,
    valign: "top",
    margin: 0,
    lineSpacingMultiple,
    ...(charSpacing !== undefined ? { charSpacing } : {}),
  });
}

function getFixedPlacementAlignment(placement: LogosPlacement): {
  alignH: AlignH;
  alignV: AlignV;
} {
  switch (placement.position) {
    case "top-left":
      return { alignH: "left", alignV: "top" };
    case "top-center":
      return { alignH: "center", alignV: "top" };
    case "top-right":
      return { alignH: "right", alignV: "top" };
    case "bottom-left":
      return { alignH: "left", alignV: "bottom" };
    case "bottom-center":
      return { alignH: "center", alignV: "bottom" };
    case "bottom-right":
      return { alignH: "right", alignV: "bottom" };
    default:
      return { alignH: "center", alignV: "top" };
  }
}

function getStartY(
  bounds: RectCoordsDims,
  padding: Padding,
  alignV: AlignV,
  totalH: number,
): number {
  switch (alignV) {
    case "top":
      return bounds.y() + padding.pt();
    case "bottom":
      return bounds.y() + bounds.h() - padding.pb() - totalH;
    case "middle":
      return bounds.y() + (bounds.h() - totalH) / 2;
  }
}
