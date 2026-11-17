// Copyright 2023-2026, Tim Roberton. MIT license.
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
import type { Padding } from "../../deps.ts";
import type {
  MeasuredSectionPage,
  PagePrimitive,
  SectionPageInputs,
} from "../../types.ts";

export function measureSection(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: SectionPageInputs,
  style: MergedSectionStyle,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredSectionPage {
  const textMaxWidth = bounds.w() - style.padding.totalPx();

  const mSectionTitle = inputs.sectionTitle?.trim()
    ? rc.mText(
      inputs.sectionTitle.trim(),
      style.text.sectionTitle,
      textMaxWidth,
    )
    : undefined;

  const mSectionSubtitle = inputs.sectionSubtitle?.trim()
    ? rc.mText(
      inputs.sectionSubtitle.trim(),
      style.text.sectionSubtitle,
      textMaxWidth,
    )
    : undefined;

  const { primitives, totalH } = buildSectionPrimitives(
    bounds,
    inputs,
    style,
    mSectionTitle,
    mSectionSubtitle,
  );

  return {
    type: "section",
    inputs,
    bounds,
    style,
    overflow: totalH > bounds.h(),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mSectionTitle,
    mSectionSubtitle,
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
  inputs: SectionPageInputs,
  s: MergedSectionStyle,
  mSectionTitle?: import("../../deps.ts").MeasuredText,
  mSectionSubtitle?: import("../../deps.ts").MeasuredText,
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
  if (inputs.overlay) {
    primitives.push({
      type: "image",
      id: "sectionOverlay",
      image: inputs.overlay,
      rcd: bounds,
    });
  }

  // Calculate layout
  const sectionTitleH = mSectionTitle ? mSectionTitle.dims.h() : 0;
  const sectionSubtitleH = mSectionSubtitle ? mSectionSubtitle.dims.h() : 0;

  const totalH = sectionTitleH +
    (sectionSubtitleH > 0 ? s.sectionTitleBottomPadding + sectionSubtitleH : 0);

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
  if (mSectionSubtitle && sectionSubtitleH > 0) {
    primitives.push({
      type: "text",
      id: "sectionSubtitle",
      mText: mSectionSubtitle,
      x: textX,
      y: currentY,
      alignH: alignH,
      alignV: "top",
      maxWidth: textMaxWidth,
    });
  }

  return { primitives, totalH };
}
