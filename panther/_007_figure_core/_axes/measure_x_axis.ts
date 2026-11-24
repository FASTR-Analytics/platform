// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DimensionMember,
  MergedGridStyle,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import type { ValueRange, YAxisWidthInfoBase } from "../types.ts";
import type {
  XAxisConfig,
  XCategoryAxisConfig,
  XValueAxisConfig,
} from "./axis_configs.ts";
import { measureXPeriodAxis } from "./x_period/measure.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import {
  measureSecondXValueAxisHeightInfo,
  measureXValueAxisHeightInfo,
  measureXValueAxisLayout,
} from "./x_value/measure.ts";
import type { XValueAxisMeasuredInfo } from "./x_value/types.ts";
import { measureXTextAxis } from "./x_text/measure.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type MeasuredXAxis =
  | {
    type: "text";
    config: Extract<XAxisConfig, { type: "text" }>;
    info: XTextAxisMeasuredInfo;
  }
  | {
    type: "period";
    config: Extract<XAxisConfig, { type: "period" }>;
    info: XPeriodAxisMeasuredInfo;
  }
  | {
    type: "value";
    config: Extract<XAxisConfig, { type: "value" }>;
    info: XValueAxisMeasuredInfo;
  };

export function measureXCategoryAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  uniformSubChartWidth: number,
  config: XCategoryAxisConfig,
  gridStyle: MergedGridStyle,
  // This pane's indicator order (a subset under unbalanced membership, a
  // permutation under a value sort); text axis only. See measureXTextAxis for
  // the extent/layout split.
  visibleIndicatorMembers?: DimensionMember[],
  // Proportional tier-or-lane layout: the uniform slot width (slotExtent); text axis only.
  slotExtentOverride?: number,
): Extract<MeasuredXAxis, { type: "text" | "period" }> {
  switch (config.type) {
    case "text":
      return {
        type: "text",
        config,
        info: measureXTextAxis(
          rc,
          innerRcd,
          yAxisWidthInfo,
          uniformSubChartWidth,
          config.indicatorMembers,
          config.axisStyle,
          gridStyle,
          visibleIndicatorMembers,
          slotExtentOverride,
        ),
      };
    case "period":
      return {
        type: "period",
        config,
        info: measureXPeriodAxis(
          rc,
          innerRcd,
          yAxisWidthInfo,
          uniformSubChartWidth,
          config.periodType,
          config.nTimePoints,
          config.axisStyle,
          gridStyle,
        ),
      };
  }
}

export function measureXValueAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  config: XValueAxisConfig,
  gridStyle: MergedGridStyle,
  i_pane: number,
  nLanes: number,
): Extract<MeasuredXAxis, { type: "value" }> {
  const xValueAxisHeightInfo = measureXValueAxisHeightInfo(
    rc,
    config.axisData,
    config.axisLabel,
    config.axisStyle,
    gridStyle,
    innerRcd,
    i_pane,
    nLanes,
  );
  return {
    type: "value",
    config,
    info: measureXValueAxisLayout(
      innerRcd,
      yAxisWidthInfo.widthIncludingYAxisStrokeWidth,
      innerRcd.bottomY() - xValueAxisHeightInfo.heightIncludingXAxisStrokeWidth,
      xValueAxisHeightInfo,
    ),
  };
}

// The second x value axis stands above the tiers, below the lane headers, at
// topY, with as many ticks per lane as the first's.
export function measureSecondXValueAxis(
  rc: RenderContext,
  innerRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfoBase,
  config: XValueAxisConfig,
  gridStyle: MergedGridStyle,
  firstAxis: Extract<MeasuredXAxis, { type: "value" }>,
  i_pane: number,
  topY: number,
): Extract<MeasuredXAxis, { type: "value" }> {
  return {
    type: "value",
    config,
    info: measureXValueAxisLayout(
      innerRcd,
      yAxisWidthInfo.widthIncludingYAxisStrokeWidth,
      topY,
      measureSecondXValueAxisHeightInfo(
        rc,
        config.axisData,
        config.axisLabel,
        config.axisStyle,
        gridStyle,
        i_pane,
        firstAxis.info.xValueAxisHeightInfo.xAxisTickValues,
      ),
    ),
  };
}

export function getXValueAxisValueRange(
  xAxis: Extract<MeasuredXAxis, { type: "value" }>,
  iLane: number,
): ValueRange {
  const tickValues = xAxis.info.xValueAxisHeightInfo.xAxisTickValues[iLane];
  return {
    valueMin: tickValues?.at(0) ?? 0,
    valueMax: tickValues?.at(-1) ?? 1,
  };
}
