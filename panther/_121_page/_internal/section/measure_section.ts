// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MeasuredImage,
  MeasuredText,
  MergedSectionStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import { isOverflow } from "../../deps.ts";
import type {
  MeasuredSectionPage,
  PagePrimitive,
  SectionPageInputs,
} from "../../types.ts";
import { getStartY, getTextX } from "../stack_placement.ts";

export function measureSection(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: SectionPageInputs,
  style: MergedSectionStyle,
  fullPageBounds: RectCoordsDims,
  measuredSplitImage: MeasuredImage | undefined,
  mWatermark: MeasuredText | undefined,
): MeasuredSectionPage {
  const paddedBounds = bounds.getPadded(style.padding);

  const mSectionTitle = inputs.sectionTitle?.trim()
    ? rc.mText(
      inputs.sectionTitle.trim(),
      style.text.sectionTitle,
      paddedBounds.w(),
    )
    : undefined;

  const mSectionSubtitle = inputs.sectionSubtitle?.trim()
    ? rc.mText(
      inputs.sectionSubtitle.trim(),
      style.text.sectionSubtitle,
      paddedBounds.w(),
    )
    : undefined;

  const { primitives, totalH } = buildSectionPrimitives(
    bounds,
    paddedBounds,
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
    overflow: isOverflow(totalH, paddedBounds.h()),
    fullPageBounds,
    measuredSplitImage,
    mWatermark,
    primitives,
    mSectionTitle,
    mSectionSubtitle,
  };
}

function buildSectionPrimitives(
  bounds: RectCoordsDims,
  paddedBounds: RectCoordsDims,
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

  const titleGap = sectionTitleH > 0 && sectionSubtitleH > 0
    ? s.sectionTitleBottomPadding
    : 0;
  const totalH = sectionTitleH + titleGap + sectionSubtitleH;

  const textX = getTextX(paddedBounds, alignH);
  let currentY = getStartY(paddedBounds, alignV, totalH);

  const textMaxWidth = paddedBounds.w();

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
    currentY += sectionTitleH + titleGap;
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
