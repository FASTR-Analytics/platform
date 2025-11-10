// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedChartOVStyle, MergedTimeseriesStyle } from "../deps.ts";
import type { XAxisMeasuredInfo } from "./measure_x_axis.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

///////////////////////////////////////////
//                                       //
//    Axis Rendering Configuration       //
//                                       //
///////////////////////////////////////////

// Configuration needed for mapping coordinates and generating content primitives
export interface AxisRenderingConfig {
  incrementWidth: number;
  isCentered: boolean;
  nVals: number;
}

// Extract rendering config from X-axis measured info
export function getXAxisRenderConfig(
  xAxisType: "text" | "period" | "scale",
  xAxisMeasuredInfo: XAxisMeasuredInfo,
  transformedData: { indicatorHeaders?: string[]; nTimePoints?: number },
  style: MergedChartOVStyle | MergedTimeseriesStyle,
): AxisRenderingConfig {
  switch (xAxisType) {
    case "text": {
      const mx = xAxisMeasuredInfo as XTextAxisMeasuredInfo;
      const textStyle = style as MergedChartOVStyle;
      return {
        incrementWidth: mx.indicatorAreaInnerWidth,
        isCentered: textStyle.xTextAxis.tickPosition === "center",
        nVals: transformedData.indicatorHeaders?.length ?? 0,
      };
    }
    case "period": {
      const mx = xAxisMeasuredInfo as XPeriodAxisMeasuredInfo;
      return {
        incrementWidth: mx.periodIncrementWidth,
        isCentered: mx.periodAxisType === "year-centered",
        nVals: transformedData.nTimePoints ?? 0,
      };
    }
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}
