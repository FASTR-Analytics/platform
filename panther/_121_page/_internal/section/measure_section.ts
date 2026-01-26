// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { Padding, RectCoordsDims as RCD } from "../../deps.ts";
import type {
  MeasuredSectionPage,
  PagePrimitive,
  SectionPageInputs,
} from "../../types.ts";

export function measureSection(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SectionPageInputs,
  s: MergedPageStyle,
  responsiveScale?: number,
): MeasuredSectionPage {
  // Type is guaranteed by TypeScript

  const textMaxWidth = bounds.w() - s.section.padding.totalPx();

  const mSectionTitle = item.sectionTitle?.trim()
    ? rc.mText(item.sectionTitle.trim(), s.text.sectionTitle, textMaxWidth)
    : undefined;

  const mSectionSubTitle = item.sectionSubTitle?.trim()
    ? rc.mText(
      item.sectionSubTitle.trim(),
      s.text.sectionSubTitle,
      textMaxWidth,
    )
    : undefined;

  const mWatermark = item.watermark?.trim()
    ? rc.mText(item.watermark.trim(), s.text.watermark, bounds.w())
    : undefined;

  const primitives = buildSectionPrimitives(
    bounds,
    item,
    s,
    mSectionTitle,
    mSectionSubTitle,
    mWatermark,
  );

  return {
    type: "section",
    item,
    bounds,
    mergedPageStyle: s,
    responsiveScale,
    overflow: false,
    primitives,
    mSectionTitle,
    mSectionSubTitle,
  };
}

function buildSectionPrimitives(
  bounds: RectCoordsDims,
  item: SectionPageInputs,
  s: MergedPageStyle,
  mSectionTitle?: import("../../deps.ts").MeasuredText,
  mSectionSubTitle?: import("../../deps.ts").MeasuredText,
  mWatermark?: import("../../deps.ts").MeasuredText,
): PagePrimitive[] {
  const primitives: PagePrimitive[] = [];

  // Background
  if (s.section.backgroundColor !== "none") {
    primitives.push({
      type: "background",
      id: "sectionBackground",
      rcd: bounds,
      fillColor: s.section.backgroundColor,
    });
  }

  // Overlay
  if (item.overlay) {
    primitives.push({
      type: "image",
      id: "sectionOverlay",
      image: item.overlay,
      rcd: bounds,
    });
  }

  // Calculate layout
  const sectionTitleH = mSectionTitle ? mSectionTitle.dims.h() : 0;
  const sectionSubTitleH = mSectionSubTitle ? mSectionSubTitle.dims.h() : 0;

  const totalH = sectionTitleH +
    (sectionSubTitleH > 0 ? sectionSubTitleH + s.section.gapY : 0);
  let currentY = bounds.y() + (bounds.h() - totalH) / 2;

  const textMaxWidth = bounds.w() - s.section.padding.totalPx();

  // Section Title
  if (mSectionTitle && sectionTitleH > 0) {
    primitives.push({
      type: "text",
      id: "sectionTitle",
      mText: mSectionTitle,
      x: bounds.centerX(),
      y: currentY,
      hAlign: "center",
      vAlign: "top",
      maxWidth: textMaxWidth,
    });
    currentY += sectionTitleH + s.section.gapY;
  }

  // Section Subtitle
  if (mSectionSubTitle && sectionSubTitleH > 0) {
    primitives.push({
      type: "text",
      id: "sectionSubTitle",
      mText: mSectionSubTitle,
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
      id: "sectionWatermark",
      mText: mWatermark,
      x: bounds.centerX(),
      y: bounds.centerY(),
      hAlign: "center",
      vAlign: "center",
    });
  }

  return primitives;
}
