// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims, RenderContext } from "../deps.ts";
import type { YScaleAxisWidthInfo } from "../types.ts";
import { measureXPeriodAxis } from "./x_period/measure.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { measureXTextAxis } from "./x_text/measure.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type XAxisType = "text" | "period" | "scale";

import type { MergedChartOVStyle, MergedTimeseriesStyle } from "../deps.ts";

export type XAxisMeasureData =
  | {
    type: "text";
    indicatorHeaders: string[];
    nLanes: number;
    mergedStyle: MergedChartOVStyle;
  }
  | {
    type: "period";
    periodType: "year-month" | "year-quarter" | "year";
    nTimePoints: number;
    nLanes: number;
    mergedStyle: MergedTimeseriesStyle;
  }
  | {
    type: "scale";
    // Future: scale-specific data
  };

export type XAxisMeasuredInfo =
  | XTextAxisMeasuredInfo
  | XPeriodAxisMeasuredInfo;

export function measureXAxis(
  rc: RenderContext,
  contentRcd: RectCoordsDims,
  yScaleAxisWidthInfo: YScaleAxisWidthInfo,
  data: XAxisMeasureData,
): XAxisMeasuredInfo {
  switch (data.type) {
    case "text":
      return measureXTextAxis(
        rc,
        contentRcd,
        yScaleAxisWidthInfo,
        data.indicatorHeaders,
        data.nLanes,
        data.mergedStyle,
      );
    case "period":
      return measureXPeriodAxis(
        rc,
        contentRcd,
        yScaleAxisWidthInfo,
        data.periodType,
        data.nTimePoints,
        data.nLanes,
        data.mergedStyle,
      );
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}
