// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedPageStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { CoverPageInputs, MeasuredCoverPage } from "../../types.ts";

export function measureCover(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: CoverPageInputs,
  s: MergedPageStyle,
  responsiveScale?: number,
): MeasuredCoverPage {
  // Type is guaranteed by TypeScript

  const mTitle = item.title?.trim()
    ? rc.mText(item.title.trim(), s.text.coverTitle, bounds.w() * 0.85)
    : undefined;

  const mSubTitle = item.subTitle?.trim()
    ? rc.mText(item.subTitle.trim(), s.text.coverSubTitle, bounds.w() * 0.85)
    : undefined;

  const mAuthor = item.author?.trim()
    ? rc.mText(item.author.trim(), s.text.coverAuthor, bounds.w() * 0.85)
    : undefined;

  const mDate = item.date?.trim()
    ? rc.mText(item.date.trim(), s.text.coverDate, bounds.w() * 0.85)
    : undefined;

  return {
    type: "cover",
    item,
    bounds,
    mergedPageStyle: s,
    responsiveScale,
    warnings: [],
    mTitle,
    mSubTitle,
    mAuthor,
    mDate,
  };
}
