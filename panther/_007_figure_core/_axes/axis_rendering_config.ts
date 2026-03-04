// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { XAxisConfig } from "./axis_configs.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export interface AxisRenderingConfig {
  incrementWidth: number;
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
        incrementWidth: mx.indicatorAreaInnerWidth,
        isCentered: xAxisConfig.axisStyle.tickPosition === "center",
        nVals: xAxisConfig.indicatorHeaders.length,
      };
    }
    case "period": {
      const mx = xAxisMeasuredInfo as XPeriodAxisMeasuredInfo;
      return {
        incrementWidth: mx.periodIncrementWidth,
        isCentered: mx.periodAxisType === "year-centered",
        nVals: xAxisConfig.nTimePoints,
      };
    }
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}
