// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  MeasuredImage,
  MeasuredText,
  MergedCoverStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { Padding, RectCoordsDims as RCD, sum } from "../../deps.ts";
import type {
  CoverPageInputs,
  MeasuredCoverPage,
  PagePrimitive,
} from "../../types.ts";

export function measureCover(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  style: MergedCoverStyle,
  responsiveScale: number | undefined,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredCoverPage {
  const textMaxWidth = bounds.w() - style.padding.totalPx();

  const mTitle = item.title?.trim()
    ? rc.mText(item.title.trim(), style.text.coverTitle, textMaxWidth)
    : undefined;

  const mSubTitle = item.subTitle?.trim()
    ? rc.mText(item.subTitle.trim(), style.text.coverSubTitle, textMaxWidth)
    : undefined;

  const mAuthor = item.author?.trim()
    ? rc.mText(item.author.trim(), style.text.coverAuthor, textMaxWidth)
    : undefined;

  const mDate = item.date?.trim()
    ? rc.mText(item.date.trim(), style.text.coverDate, textMaxWidth)
    : undefined;

  const { primitives, totalH } = buildCoverPrimitives(
    bounds,
    item,
    style,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  );

  return {
    type: "cover",
    item,
    bounds,
    style,
    responsiveScale,
    overflow: totalH > bounds.h(),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  };
}

function getTextX(
  bounds: RectCoordsDims,
  padding: Padding,
  alignH: AlignH,
): number {
  switch (alignH) {
    case "left":
      return bounds.x() + padding.pl();
    case "right":
      return bounds.x() + bounds.w() - padding.pr();
    case "center":
      return bounds.centerX();
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

function buildCoverPrimitives(
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  s: MergedCoverStyle,
  mTitle?: import("../../deps.ts").MeasuredText,
  mSubTitle?: import("../../deps.ts").MeasuredText,
  mAuthor?: import("../../deps.ts").MeasuredText,
  mDate?: import("../../deps.ts").MeasuredText,
): { primitives: PagePrimitive[]; totalH: number } {
  const primitives: PagePrimitive[] = [];
  const alignH = s.alignH;
  const alignV = s.alignV;

  // Background
  if (s.backgroundColor !== "none") {
    primitives.push({
      type: "background",
      id: "coverBackground",
      rcd: bounds,
      fillColor: s.backgroundColor,
    });
  }

  // Overlay
  if (item.overlay) {
    primitives.push({
      type: "image",
      id: "coverOverlay",
      image: item.overlay,
      rcd: bounds,
    });
  }

  // Calculate layout
  const logoH = item.titleLogos && item.titleLogos.length > 0 ? s.logoHeight : 0;
  const titleH = mTitle ? mTitle.dims.h() : 0;
  const subTitleH = mSubTitle ? mSubTitle.dims.h() : 0;
  const authorH = mAuthor ? mAuthor.dims.h() : 0;
  const dateH = mDate ? mDate.dims.h() : 0;

  let totalH = 0;
  let lastBottomPadding = 0;
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    totalH += logoH + s.logoBottomPadding;
    lastBottomPadding = s.logoBottomPadding;
  }
  if (mTitle && titleH > 0) {
    totalH += titleH + s.titleBottomPadding;
    lastBottomPadding = s.titleBottomPadding;
  }
  if (mSubTitle && subTitleH > 0) {
    totalH += subTitleH + s.subTitleBottomPadding;
    lastBottomPadding = s.subTitleBottomPadding;
  }
  if (mAuthor && authorH > 0) {
    totalH += authorH + s.authorBottomPadding;
    lastBottomPadding = s.authorBottomPadding;
  }
  if (mDate && dateH > 0) {
    totalH += dateH;
  } else {
    totalH -= lastBottomPadding;
  }

  const textX = getTextX(bounds, s.padding, alignH);
  let currentY = getStartY(bounds, s.padding, alignV, totalH);

  // Logos
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    const logoWidths = item.titleLogos.map((logo: HTMLImageElement) => {
      return (logoH * logo.width) / logo.height;
    });
    const totalLogoWidths = sum(logoWidths) + (logoWidths.length - 1) * s.logoGapX;

    let logoStartX: number;
    switch (alignH) {
      case "left":
        logoStartX = bounds.x() + s.padding.pl();
        break;
      case "right":
        logoStartX = bounds.x() + bounds.w() - s.padding.pr() - totalLogoWidths;
        break;
      case "center":
        logoStartX = bounds.x() + (bounds.w() - totalLogoWidths) / 2;
        break;
    }

    let currentX = logoStartX;
    for (let i = 0; i < item.titleLogos.length; i++) {
      const logo = item.titleLogos[i];
      const logoWidth = (logoH * logo.width) / logo.height;
      primitives.push({
        type: "image",
        id: `coverLogo${i}`,
        image: logo,
        rcd: new RCD([currentX, currentY, logoWidth, logoH]),
      });
      currentX += logoWidth + s.logoGapX;
    }
    currentY += logoH + s.logoBottomPadding;
  }

  const textMaxWidth = bounds.w() - s.padding.totalPx();

  // Title
  if (mTitle && titleH > 0) {
    primitives.push({
      type: "text",
      id: "coverTitle",
      mText: mTitle,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
    currentY += titleH + s.titleBottomPadding;
  }

  // Subtitle
  if (mSubTitle && subTitleH > 0) {
    primitives.push({
      type: "text",
      id: "coverSubTitle",
      mText: mSubTitle,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
    currentY += subTitleH + s.subTitleBottomPadding;
  }

  // Author
  if (mAuthor && authorH > 0) {
    primitives.push({
      type: "text",
      id: "coverAuthor",
      mText: mAuthor,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
    currentY += authorH + s.authorBottomPadding;
  }

  // Date
  if (mDate && dateH > 0) {
    primitives.push({
      type: "text",
      id: "coverDate",
      mText: mDate,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
  }

  return { primitives, totalH };
}
