// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedYScaleAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "./deps.ts";
import type { YScaleAxisData, YScaleAxisWidthInfo } from "./types.ts";

export function renderAllTierHeadersForPane(
  rc: RenderContext,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  yAxisRcd: RectCoordsDims,
  subChartAreaHeight: number,
  dy: YScaleAxisData,
  sy: MergedYScaleAxisStyle,
  sg: MergedGridStyle,
) {
  const my = yScaleAxisWidthInfo;
  let currentSubChartAreaY = yAxisRcd.y() + sy.tierPaddingTop;

  for (let i_tier = 0; i_tier < dy.tierHeaders.length; i_tier++) {
    if (dy.tierHeaders.length > 1) {
      const mRowHeader = rc.mText(
        dy.tierHeaders[i_tier],
        sy.text.tierHeaders,
        9999,
      );
      rc.rText(
        mRowHeader,
        [yAxisRcd.x(), currentSubChartAreaY - my.halfYAxisTickLabelH],
        "left",
      );
    }
    currentSubChartAreaY += subChartAreaHeight + sy.tierGapY;
  }
}
