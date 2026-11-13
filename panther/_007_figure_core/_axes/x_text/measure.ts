// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DimensionMember,
  MergedGridStyle,
  MergedXTextAxisStyle,
  RectCoordsDims,
  RenderContext,
} from "../../deps.ts";
import type { YAxisWidthInfoBase } from "../../types.ts";
import type { XTextAxisMeasuredInfo } from "./types.ts";

export function measureXTextAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  uniformSubChartWidth: number,
  indicatorMembers: DimensionMember[],
  axisStyle: MergedXTextAxisStyle,
  gridStyle: MergedGridStyle,
  // This pane's indicator order (a subset under unbalanced membership, a
  // permutation under a value sort) drives the slot/tick LAYOUT, while the
  // axis EXTENT (height) stays measured from the
  // global set at the global slot width. Per-pane extents would give panes
  // different sub-chart rects and break cross-pane value-direction alignment; the
  // global measure is a safe upper bound (a subset at a wider slot never
  // wraps taller).
  visibleIndicatorMembers?: DimensionMember[],
  // Proportional tier-or-lane layout: the uniform slot width IS slotExtent for every
  // tier or lane, so both the layout increment and the extent wrap width are exactly
  // slotExtent (the equal-split widths no longer exist).
  slotExtentOverride?: number,
): XTextAxisMeasuredInfo {
  const sx = axisStyle;

  const yAxisWidthIncludingStroke =
    yAxisWidthInfo.widthIncludingYAxisStrokeWidth;

  const xAxisW = innerRcd.w() - yAxisWidthIncludingStroke;

  const innerWidthFor = (n: number) =>
    sx.tickPosition === "center"
      ? uniformSubChartWidth / Math.max(1, n)
      : (uniformSubChartWidth - gridStyle.gridLineStrokeWidth * (n + 1)) /
        Math.max(1, n);

  const layoutMembers = visibleIndicatorMembers ?? indicatorMembers;
  const slotExtent = slotExtentOverride ??
    innerWidthFor(layoutMembers.length);
  const balancedSlotExtent = slotExtentOverride ??
    innerWidthFor(indicatorMembers.length);

  // Cap the vertical extent of rotated (vertical) tick labels so a long label
  // can't grow the axis without bound. This mirrors yTextAxis.maxTickLabelW,
  // which caps the horizontal extent of horizontal tick labels. For rotated
  // text the mText "maxWidth" arg is the reading-direction (pre-rotation)
  // length, which becomes the label's vertical extent after rotation.
  const verticalTickLabelMaxHeight = innerRcd.h() *
    sx.maxTickLabelHeightFractionOfPane;

  let maxIndicatorTickLabelHeight = 0;

  for (const indicatorMember of indicatorMembers) {
    const mText = rc.mText(
      indicatorMember.label,
      sx.text.xTextAxisTickLabels,
      sx.verticalTickLabels ? verticalTickLabelMaxHeight : balancedSlotExtent,
      { rotation: sx.verticalTickLabels ? "anticlockwise" : undefined },
    );
    maxIndicatorTickLabelHeight = Math.max(
      maxIndicatorTickLabelHeight,
      mText.dims.h(),
    );
  }

  const heightIncludingXAxisStrokeWidth = sx.tickPosition === "center"
    ? gridStyle.axisStrokeWidth +
      sx.tickLength +
      sx.tickLabelGap +
      maxIndicatorTickLabelHeight
    : gridStyle.axisStrokeWidth + sx.tickLabelGap + maxIndicatorTickLabelHeight;

  const xAxisRcd = innerRcd.getAdjusted((prev) => ({
    x: prev.x() + yAxisWidthIncludingStroke,
    y: prev.bottomY() - heightIncludingXAxisStrokeWidth,
    w: xAxisW,
    h: heightIncludingXAxisStrokeWidth,
  }));

  return {
    uniformSubChartWidth,
    slotExtent,
    verticalTickLabelMaxHeight,
    xAxisRcd,
  };
}
