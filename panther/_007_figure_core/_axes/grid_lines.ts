// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PeriodType, RectCoordsDims } from "../deps.ts";
import type { YScaleAxisWidthInfo } from "../types.ts";
import { calculateVerticalGridLinesForLaneXPeriod } from "./x_period/grid_lines.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { calculateVerticalGridLinesForLaneXText } from "./x_text/grid_lines.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import { calculateHorizontalGridLinesForTier as calculateHorizontalGridLinesForTierYScale } from "./y_scale/grid_lines.ts";

///////////////////////////////////////////
//                                       //
//    X-Axis Grid Lines (Vertical)       //
//                                       //
///////////////////////////////////////////

export type XAxisGridLineConfig =
  | {
    type: "text";
    nIndicators: number;
    centeredTicks: boolean;
  }
  | {
    type: "period";
    periodType: PeriodType;
    timeMin: number;
    nTimePoints: number;
    showEveryNthTick: number;
  }
  | {
    type: "scale";
    // Future: X-scale axis
  };

export function calculateXAxisGridLines(
  i_lane: number,
  plotAreaRcd: RectCoordsDims,
  config: XAxisGridLineConfig,
  xAxisMeasuredInfo: XTextAxisMeasuredInfo | XPeriodAxisMeasuredInfo,
  gridStrokeWidth: number,
): { x: number; tickValue?: number }[] {
  switch (config.type) {
    case "text":
      return calculateVerticalGridLinesForLaneXText(
        i_lane,
        plotAreaRcd,
        xAxisMeasuredInfo as XTextAxisMeasuredInfo,
        config.nIndicators,
        gridStrokeWidth,
        config.centeredTicks,
      );
    case "period":
      return calculateVerticalGridLinesForLaneXPeriod(
        i_lane,
        plotAreaRcd,
        xAxisMeasuredInfo as XPeriodAxisMeasuredInfo,
        config.periodType,
        config.timeMin,
        config.nTimePoints,
        gridStrokeWidth,
        config.showEveryNthTick,
      );
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}

///////////////////////////////////////////
//                                       //
//    Y-Axis Grid Lines (Horizontal)     //
//                                       //
///////////////////////////////////////////

export type YAxisGridLineConfig =
  | {
    type: "scale";
  }
  | {
    type: "text";
    // Future: Y-text axis
  };

export function calculateYAxisGridLines(
  i_tier: number,
  plotAreaY: number,
  plotAreaHeight: number,
  config: YAxisGridLineConfig,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
): { y: number; tickValue: number }[] {
  switch (config.type) {
    case "scale":
      return calculateHorizontalGridLinesForTierYScale(
        i_tier,
        yScaleAxisWidthInfo,
        plotAreaY,
        plotAreaHeight,
      );
    case "text":
      throw new Error("Y-text axis not implemented yet");
  }
}
