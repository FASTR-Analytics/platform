// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { XAxisConfig, YAxisConfig } from "./axis_configs.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import type { YAxisWidthInfo } from "../types.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";

export interface AxisRenderingConfig {
  categoryIncrement: number;
  isCentered: boolean;
  nVals: number;
}

export function getXAxisRenderConfig(
  xAxisConfig: XAxisConfig,
  xAxisMeasuredInfo: XAxisMeasuredInfo,
): AxisRenderingConfig {
  switch (xAxisConfig.type) {
    case "text": {
      const mx = xAxisMeasuredInfo as XTextAxisMeasuredInfo;
      return {
        categoryIncrement: mx.indicatorAreaInnerWidth,
        isCentered: xAxisConfig.axisStyle.tickPosition === "center",
        nVals: xAxisConfig.indicatorHeaders.length,
      };
    }
    case "period": {
      const mx = xAxisMeasuredInfo as XPeriodAxisMeasuredInfo;
      return {
        categoryIncrement: mx.periodIncrementWidth,
        isCentered: mx.periodAxisType === "year-centered",
        nVals: xAxisConfig.nTimePoints,
      };
    }
    case "scale":
      throw new Error(
        "X-scale is a value axis, not a category axis — use getYAxisRenderConfig for horizontal category layout",
      );
    case "none":
      return { categoryIncrement: 0, isCentered: false, nVals: 0 };
  }
}

// Horizontal content uses Y-text as the category axis. The caller fills in
// categoryIncrement from subChartAreaHeight/nIndicators (this function can't
// compute it — the plot area dimensions aren't known here).
export function getYAxisRenderConfig(
  yAxisConfig: YAxisConfig,
  yAxisWidthInfo: YAxisWidthInfo,
): AxisRenderingConfig {
  switch (yAxisConfig.type) {
    case "text": {
      const my = yAxisWidthInfo as YTextAxisWidthInfo;
      return {
        categoryIncrement: 0, // caller sets using subChartAreaHeight / nIndicators
        isCentered: yAxisConfig.axisStyle.tickPosition === "center",
        nVals: my.nIndicators,
      };
    }
    case "scale":
      throw new Error(
        "Y-scale is a value axis, not a category axis — use getXAxisRenderConfig for vertical category layout",
      );
    case "none":
      return { categoryIncrement: 0, isCentered: false, nVals: 0 };
  }
}
