// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedChartOVStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YScaleAxisWidthInfo } from "../../types.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

// NOTE: This function depends on ChartOVDataTransformed from _010_chartov
// We pass the needed data as parameters to avoid importing from higher-numbered modules
export function measureXTextAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  indicatorHeaders: string[],
  nLanes: number,
  s: MergedChartOVStyle,
): XTextAxisMeasuredInfo {
  const sx = s.xTextAxis;

  const yAxisAreaWidthIncludingStroke =
    yScaleAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = contentRcd.w() - yAxisAreaWidthIncludingStroke;

  const subChartAreaWidth = (xAxisW -
    (sx.lanePaddingLeft +
      (nLanes - 1) * sx.laneGapX +
      sx.lanePaddingRight)) /
    nLanes;

  const indicatorAreaInnerWidth = sx.tickPosition === "center"
    ? subChartAreaWidth / indicatorHeaders.length
    : (subChartAreaWidth -
      s.grid.gridStrokeWidth * (indicatorHeaders.length + 1)) /
      indicatorHeaders.length;

  let maxIndicatorTickLabelHeight = 0;

  for (const indicatorHeader of indicatorHeaders) {
    const mText = rc.mText(
      indicatorHeader,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels
        ? Number.POSITIVE_INFINITY
        : indicatorAreaInnerWidth,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );
    maxIndicatorTickLabelHeight = Math.max(
      maxIndicatorTickLabelHeight,
      mText.dims.h(),
    );
  }

  const heightIncludingXAxisStrokeWidth = sx.tickPosition === "center"
    ? s.grid.axisStrokeWidth +
      sx.tickHeight +
      sx.tickLabelGap +
      maxIndicatorTickLabelHeight
    : s.grid.axisStrokeWidth + sx.tickLabelGap + maxIndicatorTickLabelHeight;

  const xAxisRcd = contentRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisAreaWidthIncludingStroke,
    y: prev.bottomY() - heightIncludingXAxisStrokeWidth,
    w: xAxisW,
    h: heightIncludingXAxisStrokeWidth,
  }));

  return {
    subChartAreaWidth,
    indicatorAreaInnerWidth,
    xAxisRcd,
  };
}
