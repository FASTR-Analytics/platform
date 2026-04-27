// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  AlignV,
  MeasuredImage,
  MeasuredText,
  MergedSectionStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { Padding } from "../../deps.ts";
import type {
  MeasuredSectionPage,
  PagePrimitive,
  SectionPageInputs,
} from "../../types.ts";

export function measureSection(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SectionPageInputs,
  style: MergedSectionStyle,
  responsiveScale: number | undefined,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredSectionPage {
  const textMaxWidth = bounds.w() - style.padding.totalPx();

  const mSectionTitle = item.sectionTitle?.trim()
    ? rc.mText(item.sectionTitle.trim(), style.text.sectionTitle, textMaxWidth)
    : undefined;

  const mSectionSubTitle = item.sectionSubTitle?.trim()
    ? rc.mText(
      item.sectionSubTitle.trim(),
      style.text.sectionSubTitle,
      textMaxWidth,
    )
    : undefined;

  const { primitives, totalH } = buildSectionPrimitives(
    bounds,
    item,
    style,
    mSectionTitle,
    mSectionSubTitle,
  );

  return {
    type: "section",
    item,
    bounds,
    style,
    responsiveScale,
    overflow: totalH > bounds.h(),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mSectionTitle,
    mSectionSubTitle,
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

function buildSectionPrimitives(
  bounds: RectCoordsDims,
  item: SectionPageInputs,
  s: MergedSectionStyle,
  mSectionTitle?: import("../../deps.ts").MeasuredText,
  mSectionSubTitle?: import("../../deps.ts").MeasuredText,
): { primitives: PagePrimitive[]; totalH: number } {
  const primitives: PagePrimitive[] = [];
  const alignH = s.alignH;
  const alignV = s.alignV;

  // Background
  if (s.background !== "none") {
    primitives.push({
      type: "background",
      id: "sectionBackground",
      rcd: bounds,
      background: s.background,
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
    (sectionSubTitleH > 0 ? s.sectionTitleBottomPadding + sectionSubTitleH : 0);

  const textX = getTextX(bounds, s.padding, alignH);
  let currentY = getStartY(bounds, s.padding, alignV, totalH);

  const textMaxWidth = bounds.w() - s.padding.totalPx();

  // Section Title
  if (mSectionTitle && sectionTitleH > 0) {
    primitives.push({
      type: "text",
      id: "sectionTitle",
      mText: mSectionTitle,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
    currentY += sectionTitleH + s.sectionTitleBottomPadding;
  }

  // Section Subtitle
  if (mSectionSubTitle && sectionSubTitleH > 0) {
    primitives.push({
      type: "text",
      id: "sectionSubTitle",
      mText: mSectionSubTitle,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
  }

  return { primitives, totalH };
}
