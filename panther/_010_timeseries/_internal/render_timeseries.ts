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

  // Build base config (without pane-specific measured info)
  const config = {
    styles: s,
    data: mTimeseries.transformedData,
    xAxisStyle: s.xPeriodAxis,

    xAxisType: "period" as const,
    xAxisRenderDataBase: {
      type: "period" as const,
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
