// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../../deps.ts";
import { sum } from "../../deps.ts";
import type { MeasuredCoverPage } from "../../types.ts";

export function renderCover(
  rc: RenderContext,
  measured: MeasuredCoverPage,
): void {
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.mergedPageStyle;

  if (s.cover.backgroundColor !== "none") {
    rc.rRect(bounds, {
      fillColor: s.cover.backgroundColor,
    });
  }

  if (item.overlay) {
    rc.rImage(item.overlay, bounds.x(), bounds.y(), bounds.w(), bounds.h());
  }

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
  if (measured.mTitle && titleH > 0) {
    totalH += titleH + s.cover.gapY;
  }

  if (measured.mSubTitle && subTitleH > 0) {
    totalH += subTitleH + s.cover.gapY;
  }

  if (measured.mAuthor && authorH > 0) {
    totalH += authorH + s.cover.gapY;
  }

  if (measured.mDate && dateH > 0) {
    totalH += dateH + s.cover.gapY;
  }

  totalH -= s.cover.gapY;

  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  if (item.titleLogos && item.titleLogos.length > 0 && logoH > 0) {
    const logoWidths = item.titleLogos.map((logo: HTMLImageElement) => {
      return (logoH * logo.width) / logo.height;
    });
    const totalLogoWidths = sum(logoWidths) +
      (logoWidths.length - 1) * s.cover.logoGapX;
    let currentX = bounds.x() + (bounds.w() - totalLogoWidths) / 2;
    for (const logo of item.titleLogos) {
      const logoWidth = (logoH * logo.width) / logo.height;
      rc.rImage(logo, currentX, currentY, logoWidth, logoH);
      currentX += logoWidth + s.cover.logoGapX;
    }
    currentY += logoH + s.cover.gapY;
  }

  if (measured.mTitle && titleH > 0) {
    rc.rText(measured.mTitle, [bounds.centerX(), currentY], "center", "top");
    currentY += titleH + s.cover.gapY;
  }

  if (measured.mSubTitle && subTitleH > 0) {
    rc.rText(measured.mSubTitle, [bounds.centerX(), currentY], "center", "top");
    currentY += subTitleH + s.cover.gapY;
  }

  if (measured.mAuthor && authorH > 0) {
    rc.rText(measured.mAuthor, [bounds.centerX(), currentY], "center", "top");
    currentY += authorH + s.cover.gapY;
  }

  if (measured.mDate && dateH > 0) {
    rc.rText(measured.mDate, [bounds.centerX(), currentY], "center", "top");
    currentY += dateH + s.cover.gapY;
  }

  if (item.watermark) {
    const mText = rc.mText(item.watermark, s.text.watermark, bounds.w());
    rc.rText(mText, bounds.centerCoords(), "center", "center");
  }
}
