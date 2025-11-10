// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomFigureStyle, RenderContext } from "../deps.ts";
import { measureLegend } from "../mod.ts";
import type { LegendItem } from "../types.ts";

export type SurroundsHeightInfo = {
  contentW: number;
  nonContentH: number;
};
export function getSurroundsHeight(
  rc: RenderContext,
  width: number,
  cs: CustomFigureStyle,
  caption: string | undefined,
  legendItems: LegendItem[] | undefined,
): SurroundsHeightInfo {
  const sSurrounds = cs.getMergedSurroundsStyle();
  const innerW = width - sSurrounds.padding.totalPx();

  // Caption
  let captionAndCaptionGapH = 0;

  if (caption?.trim()) {
    const mCaption = rc.mText(caption.trim(), sSurrounds.text.caption, innerW);
    captionAndCaptionGapH = mCaption.dims.h() + sSurrounds.captionGap;
  }

  // Legend
  let legendAndLegendGapW = 0;
  let legendAndLegendGapH = 0;

  if (
    legendItems &&
    legendItems.length > 0 &&
    sSurrounds.legendPosition !== "none"
  ) {
    const sLegend = sSurrounds.legend;
    const mLegend = measureLegend(rc, legendItems, sLegend);

    const isBottom = ["bottom-left", "bottom-center", "bottom-right"].includes(
      sSurrounds.legendPosition,
    );
    const isRight = ["right-top", "right-center", "right-bottom"].includes(
      sSurrounds.legendPosition,
    );

    legendAndLegendGapH = isBottom
      ? mLegend.dimensions.h() + sSurrounds.legendGap
      : 0;
    legendAndLegendGapW = isRight
      ? mLegend.dimensions.w() + sSurrounds.legendGap
      : 0;
  }

  return {
    contentW: width - legendAndLegendGapW,
    nonContentH: captionAndCaptionGapH +
      legendAndLegendGapH +
      sSurrounds.padding.totalPy(),
  };
}
