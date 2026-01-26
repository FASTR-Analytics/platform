// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedPageStyle,
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
  s: MergedPageStyle,
  responsiveScale?: number,
): MeasuredCoverPage {
  // Type is guaranteed by TypeScript

  const textMaxWidth = bounds.w() - s.cover.padding.totalPx();

  const mTitle = item.title?.trim()
    ? rc.mText(item.title.trim(), s.text.coverTitle, textMaxWidth)
    : undefined;

  const mSubTitle = item.subTitle?.trim()
    ? rc.mText(item.subTitle.trim(), s.text.coverSubTitle, textMaxWidth)
    : undefined;

  const mAuthor = item.author?.trim()
    ? rc.mText(item.author.trim(), s.text.coverAuthor, textMaxWidth)
    : undefined;

  const mDate = item.date?.trim()
    ? rc.mText(item.date.trim(), s.text.coverDate, textMaxWidth)
    : undefined;

  const mWatermark = item.watermark?.trim()
    ? rc.mText(item.watermark.trim(), s.text.watermark, bounds.w())
    : undefined;

  const primitives = buildCoverPrimitives(
    bounds,
    item,
    s,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
    mWatermark,
  );

  return {
    type: "cover",
    item,
    bounds,
    mergedPageStyle: s,
    responsiveScale,
    overflow: false,
    primitives,
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  };
}

function buildCoverPrimitives(
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  s: MergedPageStyle,
  mTitle?: import("../../deps.ts").MeasuredText,
  mSubTitle?: import("../../deps.ts").MeasuredText,
  mAuthor?: import("../../deps.ts").MeasuredText,
  mDate?: import("../../deps.ts").MeasuredText,
  mWatermark?: import("../../deps.ts").MeasuredText,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];

  // Background
  if (s.cover.backgroundColor !== "none") {
    primitives.push({
      type: "background",
      id: "coverBackground",
      rcd: bounds,
      fillColor: s.cover.backgroundColor,
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
  const logoH = item.titleLogos && item.titleLogos.length > 0
    ? s.cover.logoHeight
    : 0;
  const titleH = mTitle ? mTitle.dims.h() : 0;
  const subTitleH = mSubTitle ? mSubTitle.dims.h() : 0;
  const authorH = mAuthor ? mAuthor.dims.h() : 0;
  const dateH = mDate ? mDate.dims.h() : 0;

  let totalH = 0;
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    totalH += logoH + s.cover.gapY;
  }
  if (mTitle && titleH > 0) {
    totalH += titleH + s.cover.gapY;
  }
  if (mSubTitle && subTitleH > 0) {
    totalH += subTitleH + s.cover.gapY;
  }
  if (mAuthor && authorH > 0) {
    totalH += authorH + s.cover.gapY;
  }
  if (mDate && dateH > 0) {
    totalH += dateH + s.cover.gapY;
  }
  totalH -= s.cover.gapY;

  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  // Logos
  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    const logoWidths = item.titleLogos.map((logo: HTMLImageElement) => {
      return (logoH * logo.width) / logo.height;
    });
    const totalLogoWidths = sum(logoWidths) +
      (logoWidths.length - 1) * s.cover.logoGapX;
    let currentX = bounds.x() + (bounds.w() - totalLogoWidths) / 2;

    for (let i = 0; i < item.titleLogos.length; i++) {
      const logo = item.titleLogos[i];
      const logoWidth = (logoH * logo.width) / logo.height;
      primitives.push({
        type: "image",
        id: `coverLogo${i}`,
        image: logo,
        rcd: new RCD([currentX, currentY, logoWidth, logoH]),
      });
      currentX += logoWidth + s.cover.logoGapX;
    }
    currentY += logoH + s.cover.gapY;
  }

  const textMaxWidth = bounds.w() - s.cover.padding.totalPx();

  // Title
  if (mTitle && titleH > 0) {
    primitives.push({
      type: "text",
      id: "coverTitle",
      mText: mTitle,
      x: bounds.centerX(),
      y: currentY,
      hAlign: "center",
      vAlign: "top",
      maxWidth: textMaxWidth,
    });
    currentY += titleH + s.cover.gapY;
  }

  // Subtitle
  if (mSubTitle && subTitleH > 0) {
    primitives.push({
      type: "text",
      id: "coverSubTitle",
      mText: mSubTitle,
      x: bounds.centerX(),
      y: currentY,
      hAlign: "center",
      vAlign: "top",
      maxWidth: textMaxWidth,
    });
    currentY += subTitleH + s.cover.gapY;
  }

  // Author
  if (mAuthor && authorH > 0) {
    primitives.push({
      type: "text",
      id: "coverAuthor",
      mText: mAuthor,
      x: bounds.centerX(),
      y: currentY,
      hAlign: "center",
      vAlign: "top",
      maxWidth: textMaxWidth,
    });
    currentY += authorH + s.cover.gapY;
  }

  // Date
  if (mDate && dateH > 0) {
    primitives.push({
      type: "text",
      id: "coverDate",
      mText: mDate,
      x: bounds.centerX(),
      y: currentY,
      hAlign: "center",
      vAlign: "top",
      maxWidth: textMaxWidth,
    });
  }

  // Watermark (centered on page)
  if (mWatermark) {
    primitives.push({
      type: "text",
      id: "coverWatermark",
      mText: mWatermark,
      x: bounds.centerX(),
      y: bounds.centerY(),
      hAlign: "center",
      vAlign: "center",
    });
  }

  return primitives;
}
