// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { MeasuredSectionPage, SectionPageInputs } from "../../types.ts";

export function measureSection(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: SectionPageInputs,
  s: MergedPageStyle,
  responsiveScale?: number,
): MeasuredSectionPage {
  // Type is guaranteed by TypeScript

  const mSectionTitle = item.sectionTitle?.trim()
    ? rc.mText(item.sectionTitle.trim(), s.text.sectionTitle, bounds.w() * 0.7)
    : undefined;

  const mSectionSubTitle = item.sectionSubTitle?.trim()
    ? rc.mText(
      item.sectionSubTitle.trim(),
      s.text.sectionSubTitle,
      bounds.w() * 0.7,
    )
    : undefined;

  return {
    type: "section",
    item,
    bounds,
    mergedPageStyle: s,
    responsiveScale,
    warnings: [],
    mSectionTitle,
    mSectionSubTitle,
  };
}
