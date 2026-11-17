// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type {
  OverhangClearance,
  YAxisWidthInfo,
  YValueAxisWidthInfo,
} from "../types.ts";
import type { XAxisConfig, YAxisConfig } from "./axis_configs.ts";
import { calculateVerticalGridLinesForLaneXPeriod } from "./x_period/grid_lines.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { calculateVerticalGridLinesForLaneXValue } from "./x_value/grid_lines.ts";
import type { XValueAxisMeasuredInfo } from "./x_value/types.ts";
import { calculateVerticalGridLinesForLaneXText } from "./x_text/grid_lines.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import { calculateHorizontalGridLinesForTier as calculateHorizontalGridLinesForTierYValue } from "./y_value/grid_lines.ts";
import { calculateHorizontalGridLinesForTierYText } from "./y_text/grid_lines.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";

export function calculateXAxisGridLines(
  i_lane: number,
  subChartRcd: RectCoordsDims,
  xAxisConfig: XAxisConfig,
  xAxisMeasuredInfo: XAxisMeasuredInfo,
  gridLineStrokeWidth: number,
  clearance: OverhangClearance,
  // Unbalanced indicator membership: this pane's visible slot count (text
  // axis only). Grid lines are positional, so they follow the pane's layout.
  nVisibleIndicators?: number,
): { x: number; tickValue?: number }[] {
  switch (xAxisConfig.type) {
    case "text":
      return calculateVerticalGridLinesForLaneXText(
        subChartRcd,
        xAxisMeasuredInfo as XTextAxisMeasuredInfo,
        nVisibleIndicators ?? xAxisConfig.indicatorMembers.length,
        gridLineStrokeWidth,
        xAxisConfig.axisStyle.tickPosition === "center",
      );
    case "period":
      return calculateVerticalGridLinesForLaneXPeriod(
        subChartRcd,
        xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
        xAxisConfig.periodType,
        xAxisConfig.timeMin,
        xAxisConfig.nTimePoints,
        gridLineStrokeWidth,
        xAxisConfig.axisStyle.showEveryNthTick,
        xAxisConfig.axisStyle.calendar,
      );
    case "value": {
      const mx = xAxisMeasuredInfo as XValueAxisMeasuredInfo;
      return calculateVerticalGridLinesForLaneXValue(
        i_lane,
        mx.xValueAxisHeightInfo,
        subChartRcd.x(),
        subChartRcd.w(),
        clearance,
      );
    }
    case "none":
      return [];
  }
}

export function calculateYAxisGridLines(
  i_tier: number,
  subChartRcd: RectCoordsDims,
  gridLineStrokeWidth: number,
  yAxisConfig: YAxisConfig,
  yAxisWidthInfo: YAxisWidthInfo,
  clearance: OverhangClearance,
  // Unbalanced indicator membership: this pane's visible slot count (text
  // axis only). Grid lines are positional, so they follow the pane's layout.
  nVisibleIndicators?: number,
): { y: number; tickValue?: number }[] {
  switch (yAxisConfig.type) {
    case "value":
      return calculateHorizontalGridLinesForTierYValue(
        i_tier,
        yAxisWidthInfo as YValueAxisWidthInfo,
        subChartRcd.y(),
        subChartRcd.h(),
        clearance,
      );
    case "text":
      return calculateHorizontalGridLinesForTierYText(
        subChartRcd,
        nVisibleIndicators ??
          (yAxisWidthInfo as YTextAxisWidthInfo).nIndicators,
        gridLineStrokeWidth,
        yAxisConfig.axisStyle.tickPosition === "center",
      );
    case "none":
      return [];
  }
}
