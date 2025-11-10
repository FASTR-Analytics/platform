// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedChartOVStyle,
  MergedTimeseriesStyle,
  RenderContext,
} from "../deps.ts";
import { renderXPeriodAxisForLane } from "./x_period/render.ts";
import type { XPeriodAxisMeasuredInfo } from "./x_period/types.ts";
import { renderXTextAxisForLane } from "./x_text/render.ts";
import type { XTextAxisMeasuredInfo } from "./x_text/types.ts";

export type XAxisRenderData =
  | {
    type: "text";
    mx: XTextAxisMeasuredInfo;
    indicatorHeaders: string[];
    mergedStyle: MergedChartOVStyle;
  }
  | {
    type: "period";
    mx: XPeriodAxisMeasuredInfo;
    nTimePoints: number;
    timeMin: number;
    periodType: "year-month" | "year-quarter" | "year";
    mergedStyle: MergedTimeseriesStyle;
  }
  | {
    type: "scale";
    // Future: scale-specific data
  };

export function renderXAxisForLane(
  rc: RenderContext,
  i_lane: number,
  subChartAreaX: number,
  data: XAxisRenderData,
  renderAxis: boolean,
): number[] {
  switch (data.type) {
    case "text":
      return renderXTextAxisForLane(
        rc,
        i_lane,
        subChartAreaX,
        data.mx,
        data.indicatorHeaders,
        data.mergedStyle,
        renderAxis,
      );
    case "period":
      return renderXPeriodAxisForLane(
        rc,
        i_lane,
        subChartAreaX,
        data.mx,
        data.nTimePoints,
        data.timeMin,
        data.periodType,
        data.mergedStyle,
        renderAxis,
      );
    case "scale":
      throw new Error("X-scale axis not implemented yet");
  }
}
