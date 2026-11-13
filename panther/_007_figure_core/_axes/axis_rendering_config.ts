// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { XAxisConfig, YAxisConfig } from "./axis_configs.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";
import type { YAxisWidthInfo } from "../types.ts";
import type { YTextAxisWidthInfo } from "./y_text/types.ts";

export type AxisRenderingConfig = {
  slotExtent: number;
  isCentered: boolean;
  nValues: number;
};

export function getXAxisRenderConfig(
  xAxisConfig: XAxisConfig,
  xAxisMeasuredInfo: XAxisMeasuredInfo,
): AxisRenderingConfig {
  switch (xAxisConfig.type) {
    case "text": {
      const mx = xAxisMeasuredInfo as XTextAxisMeasuredInfo;
      return {
        slotExtent: mx.slotExtent,
        isCentered: xAxisConfig.axisStyle.tickPosition === "center",
        nValues: xAxisConfig.indicatorMembers.length,
      };
    }
    case "period": {
      const mx = xAxisMeasuredInfo as XPeriodAxisMeasuredInfo;
      return {
        slotExtent: mx.slotExtent,
        isCentered: mx.periodAxisType === "year-centered",
        nValues: xAxisConfig.nTimePoints,
      };
    }
    case "value":
      throw new Error(
        "The x value axis is not a category axis — use getYAxisRenderConfig for horizontal category layout",
      );
    case "none":
      return { slotExtent: 0, isCentered: false, nValues: 0 };
  }
}

// Horizontal content uses Y-text as the category axis. The caller fills in
// slotExtent from uniformSubChartHeight/nIndicators (this function can't
// compute it — the sub-chart dimensions aren't known here).
export function getYAxisRenderConfig(
  yAxisConfig: YAxisConfig,
  yAxisWidthInfo: YAxisWidthInfo,
): AxisRenderingConfig {
  switch (yAxisConfig.type) {
    case "text": {
      const my = yAxisWidthInfo as YTextAxisWidthInfo;
      return {
        slotExtent: 0, // caller sets using uniformSubChartHeight / nIndicators
        isCentered: yAxisConfig.axisStyle.tickPosition === "center",
        nValues: my.nIndicators,
      };
    }
    case "value":
      throw new Error(
        "The y value axis is not a category axis — use getXAxisRenderConfig for vertical category layout",
      );
    case "none":
      return { slotExtent: 0, isCentered: false, nValues: 0 };
  }
}
