// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  MergedXTextAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YAxisWidthInfoBase } from "../../types.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

export function measureXTextAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  subChartAreaWidth: number,
  indicatorHeaders: string[],
  axisStyle: MergedXTextAxisStyle,
  gridStyle: MergedGridStyle,
): XTextAxisMeasuredInfo {
  const sx = axisStyle;

  const yAxisAreaWidthIncludingStroke =
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = contentRcd.w() - yAxisAreaWidthIncludingStroke;

  const indicatorAreaInnerWidth = sx.tickPosition === "center"
    ? subChartAreaWidth / indicatorHeaders.length
    : (subChartAreaWidth -
      gridStyle.gridStrokeWidth * (indicatorHeaders.length + 1)) /
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
    ? gridStyle.axisStrokeWidth +
      sx.tickHeight +
      sx.tickLabelGap +
      maxIndicatorTickLabelHeight
    : gridStyle.axisStrokeWidth + sx.tickLabelGap + maxIndicatorTickLabelHeight;

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
