// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  renderChart,
  renderChartPrimitives,
  type RenderContext,
} from "../deps.ts";
import type { MeasuredChartOV } from "../types.ts";

export function renderChartOV(rc: RenderContext, mChartOV: MeasuredChartOV) {
  const s = mChartOV.mergedStyle;

  // Build config
  const config = {
    styles: s,
    data: mChartOV.transformedData,
    xAxisInfo: mChartOV.mPanes[0].xAxisMeasuredInfo,
    xAxisStyle: s.xTextAxis,

    xAxisType: "text" as const,
    xAxisRenderData: {
      type: "text" as const,
      mx: mChartOV.mPanes[0]
        .xAxisMeasuredInfo as import("../deps.ts").XTextAxisMeasuredInfo,
      indicatorHeaders: mChartOV.transformedData.indicatorHeaders,
      mergedStyle: s,
    },
  };

  renderChart(rc, mChartOV, config);

  // Render primitives if they exist
  if (mChartOV.primitives) {
    renderChartPrimitives(rc, mChartOV.primitives);
  }
}
