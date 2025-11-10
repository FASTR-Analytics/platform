// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedChartOVStyle,
  MergedTimeseriesStyle,
  RenderContext,
} from "./deps.ts";
import type { LaneHeadersData } from "./types.ts";

export function getTopHeightForLaneHeaders(
  rc: RenderContext,
  subChartAreaWidth: number,
  laneHeaders: string[],
  s: MergedChartOVStyle | MergedTimeseriesStyle,
) {
  if (laneHeaders.length < 2) {
    return 0;
  }

  let maxHeight = 0;
  for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
    const mText = rc.mText(
      laneHeaders[i_lane],
      s.text.laneHeaders,
      subChartAreaWidth,
    );
    maxHeight = Math.max(maxHeight, mText.dims.h());
  }
  return maxHeight;
}

export function renderAllLaneHeadersForPane(
  rc: RenderContext,
  d: LaneHeadersData,
  s: MergedChartOVStyle | MergedTimeseriesStyle,
) {
  if (s.hideColHeaders || d.laneHeaders.length < 2) {
    return;
  }

  let currentSubChartAreaX = d.rcd.x() + d.lanePaddingLeft;

  for (let i_lane = 0; i_lane < d.laneHeaders.length; i_lane++) {
    const mText = rc.mText(
      d.laneHeaders[i_lane],
      s.text.laneHeaders,
      d.subChartAreaWidth,
    );
    rc.rText(
      mText,
      [currentSubChartAreaX + d.subChartAreaWidth / 2, d.rcd.bottomY()],
      "center",
      "bottom",
    );
    currentSubChartAreaX += d.subChartAreaWidth + d.laneGapX;
  }
}
