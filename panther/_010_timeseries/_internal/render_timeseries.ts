// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  renderChart,
  renderChartPrimitives,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredTimeseries } from "../types.ts";

export function renderTimeseries(
  rc: RenderContext,
  mTimeseries: MeasuredTimeseries,
) {
  const s = mTimeseries.mergedStyle;

  // Build config
  const config = {
    styles: s,
    data: mTimeseries.transformedData,
    xAxisInfo: mTimeseries.mPanes[0].xAxisMeasuredInfo,
    xAxisStyle: s.xPeriodAxis,

    xAxisType: "period" as const,
    xAxisRenderData: {
      type: "period" as const,
      mx: mTimeseries.mPanes[0]
        .xAxisMeasuredInfo as import("../deps.ts").XPeriodAxisMeasuredInfo,
      nTimePoints: mTimeseries.transformedData.nTimePoints,
      timeMin: mTimeseries.transformedData.timeMin,
      periodType: mTimeseries.transformedData.periodType,
      mergedStyle: s,
    },
  };

  renderChart(rc, mTimeseries, config);

  // Render primitives if they exist
  if (mTimeseries.primitives) {
    renderChartPrimitives(rc, mTimeseries.primitives);
  }
}
