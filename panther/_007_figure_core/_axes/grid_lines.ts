// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type {
  YAxisWidthInfo,
  YScaleAxisWidthInfo,
} from "../types.ts";
import type { XAxisConfig, YAxisConfig } from "./axis_configs.ts";
import { calculateVerticalGridLinesForLaneXPeriod } from "./x_period/grid_lines.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { calculateVerticalGridLinesForLaneXScale } from "./x_scale/grid_lines.ts";
import type { XScaleAxisMeasuredInfo } from "./x_scale/types.ts";
import { calculateVerticalGridLinesForLaneXText } from "./x_text/grid_lines.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import { calculateHorizontalGridLinesForTier as calculateHorizontalGridLinesForTierYScale } from "./y_scale/grid_lines.ts";
import { calculateHorizontalGridLinesForTierYText } from "./y_text/grid_lines.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";

export function calculateXAxisGridLines(
  i_lane: number,
  plotAreaRcd: RectCoordsDims,
  xAxisConfig: XAxisConfig,
  xAxisMeasuredInfo: XAxisMeasuredInfo,
  gridStrokeWidth: number,
): { x: number; tickValue?: number }[] {
  switch (xAxisConfig.type) {
    case "text":
      return calculateVerticalGridLinesForLaneXText(
        i_lane,
        plotAreaRcd,
        xAxisMeasuredInfo as XTextAxisMeasuredInfo,
        xAxisConfig.indicatorHeaders.length,
        gridStrokeWidth,
        xAxisConfig.axisStyle.tickPosition === "center",
      );
    case "period":
      return calculateVerticalGridLinesForLaneXPeriod(
        i_lane,
        plotAreaRcd,
        xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
        xAxisConfig.periodType,
        xAxisConfig.timeMin,
        xAxisConfig.nTimePoints,
        gridStrokeWidth,
        xAxisConfig.axisStyle.showEveryNthTick,
      );
    case "scale": {
      const mx = xAxisMeasuredInfo as XScaleAxisMeasuredInfo;
      return calculateVerticalGridLinesForLaneXScale(
        i_lane,
        mx.xScaleHeightInfo,
        plotAreaRcd.x(),
        plotAreaRcd.w(),
      );
    }
    case "none":
      return [];
  }
}

export function calculateYAxisGridLines(
  i_tier: number,
  plotAreaRcd: RectCoordsDims,
  gridStrokeWidth: number,
  yAxisConfig: YAxisConfig,
  yAxisWidthInfo: YAxisWidthInfo,
): { y: number; tickValue?: number }[] {
  switch (yAxisConfig.type) {
    case "scale":
      return calculateHorizontalGridLinesForTierYScale(
        i_tier,
        yAxisWidthInfo as YScaleAxisWidthInfo,
        plotAreaRcd.y(),
        plotAreaRcd.h(),
      );
    case "text":
      return calculateHorizontalGridLinesForTierYText(
        i_tier,
        plotAreaRcd,
        (yAxisWidthInfo as YTextAxisWidthInfo).nIndicators,
        gridStrokeWidth,
        yAxisConfig.axisStyle.tickPosition === "center",
      );
    case "none":
      return [];
  }
}
