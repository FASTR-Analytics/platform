// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedGridStyle,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import type { YAxisWidthInfo } from "../types.ts";
import type { XAxisConfig } from "./axis_configs.ts";
import { measureXPeriodAxis } from "./x_period/measure.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { measureXTextAxis } from "./x_text/measure.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type XAxisType = "text" | "period" | "scale";

export type XAxisMeasuredInfo =
  | XTextAxisMeasuredInfo
  | XPeriodAxisMeasuredInfo;

export function measureXAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yAxisWidthInfo: YAxisWidthInfo,
  subChartAreaWidth: number,
  xAxisConfig: XAxisConfig,
  gridStyle: MergedGridStyle,
): XAxisMeasuredInfo {
  switch (xAxisConfig.type) {
    case "text":
      return measureXTextAxis(
        rc,
        contentRcd,
        yAxisWidthInfo,
        subChartAreaWidth,
        xAxisConfig.indicatorHeaders,
        xAxisConfig.axisStyle,
        gridStyle,
      );
    case "period":
      return measureXPeriodAxis(
        rc,
        contentRcd,
        yAxisWidthInfo,
        subChartAreaWidth,
        xAxisConfig.periodType,
        xAxisConfig.nTimePoints,
        xAxisConfig.axisStyle,
        gridStyle,
      );
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}

export function measureXAxisHeightInfo(
  _rc: RenderContext,
  xAxisConfig: XAxisConfig,
  _gridStyle: MergedGridStyle,
): number {
  switch (xAxisConfig.type) {
    case "scale":
      // When implemented: return self-contained height from tick label measurements
      throw new Error("X-scale axis height measurement not implemented yet");
    case "text":
    case "period":
      throw new Error(
        "X-text/period height is not self-contained — use measureXAxis instead",
      );
  }
}
