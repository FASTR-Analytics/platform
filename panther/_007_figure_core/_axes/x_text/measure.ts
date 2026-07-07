// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  HeaderItem,
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
  indicatorHeaders: HeaderItem[],
  axisStyle: MergedXTextAxisStyle,
  gridStyle: MergedGridStyle,
  // Unbalanced indicator membership: this pane's visible subset drives the
  // slot/tick LAYOUT, while the axis EXTENT (height) stays measured from the
  // global set at the global slot width. Per-pane extents would give panes
  // different plot rects and break cross-pane scale-direction alignment; the
  // global measure is a safe upper bound (a subset at a wider slot never
  // wraps taller).
  visibleIndicatorHeaders?: HeaderItem[],
): XTextAxisMeasuredInfo {
  const sx = axisStyle;

  const yAxisAreaWidthIncludingStroke =
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = contentRcd.w() - yAxisAreaWidthIncludingStroke;

  const innerWidthFor = (n: number) =>
    sx.tickPosition === "center"
      ? subChartAreaWidth / Math.max(1, n)
      : (subChartAreaWidth - gridStyle.gridStrokeWidth * (n + 1)) /
        Math.max(1, n);

  const layoutHeaders = visibleIndicatorHeaders ?? indicatorHeaders;
  const indicatorAreaInnerWidth = innerWidthFor(layoutHeaders.length);
  const extentInnerWidth = innerWidthFor(indicatorHeaders.length);

  // Cap the vertical extent of rotated (vertical) tick labels so a long label
  // can't grow the axis without bound. This mirrors yTextAxis.maxTickLabelW,
  // which caps the horizontal extent of horizontal tick labels. For rotated
  // text the mText "maxWidth" arg is the reading-direction (pre-rotation)
  // length, which becomes the label's vertical extent after rotation.
  const verticalTickLabelMaxHeight = contentRcd.h() *
    sx.maxTickLabelHeightAsPctOfChart;

  let maxIndicatorTickLabelHeight = 0;

  for (const indicatorHeader of indicatorHeaders) {
    const mText = rc.mText(
      indicatorHeader.label,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels ? verticalTickLabelMaxHeight : extentInnerWidth,
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
    verticalTickLabelMaxHeight,
    xAxisRcd,
  };
}
