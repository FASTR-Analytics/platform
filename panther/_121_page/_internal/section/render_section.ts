// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../../deps.ts";
import { getColor } from "../../deps.ts";
import type { MeasuredSectionPage } from "../../types.ts";

export function renderSection(
  rc: RenderContext,
  measured: MeasuredSectionPage,
): void {
  const item = measured.item;
  const bounds = measured.bounds;
  const s = measured.mergedPageStyle;

  if (s.section.backgroundColor !== "none") {
    rc.rRect(bounds, {
      fillColor: getColor(s.section.backgroundColor),
    });
  }

  if (item.overlay) {
    rc.rImage(item.overlay, bounds.x(), bounds.y(), bounds.w(), bounds.h());
  }

  const sectionTitleH = measured.mSectionTitle
    ? measured.mSectionTitle.dims.h()
    : 0;
  const sectionSubTitleH = measured.mSectionSubTitle
    ? measured.mSectionSubTitle.dims.h()
    : 0;

  const totalH = sectionTitleH +
    (sectionSubTitleH > 0 ? sectionSubTitleH + s.section.gapY : 0);
  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  if (measured.mSectionTitle && sectionTitleH > 0) {
    rc.rText(
      measured.mSectionTitle,
      [bounds.centerX(), currentY],
      "center",
      "top",
    );
    currentY += sectionTitleH + s.section.gapY;
  }

  if (measured.mSectionSubTitle && sectionSubTitleH > 0) {
    rc.rText(
      measured.mSectionSubTitle,
      [bounds.centerX(), currentY],
      "center",
      "top",
    );
  }

  if (item.watermark) {
    const mText = rc.mText(item.watermark, s.text.watermark, bounds.w());
    rc.rText(mText, bounds.centerCoords(), "center", "center");
  }
}
