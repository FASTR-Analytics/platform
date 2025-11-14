// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { renderChart, type RenderContext, renderPrimitives } from "../deps.ts";
import type { MeasuredChartOV } from "../types.ts";

export function renderChartOV(rc: RenderContext, mChartOV: MeasuredChartOV) {
  const s = mChartOV.mergedStyle;

  // Build base config (without pane-specific measured info)
  const config = {
    styles: s,
    data: mChartOV.transformedData,
    xAxisStyle: s.xTextAxis,

    xAxisType: "text" as const,
    xAxisRenderDataBase: {
      type: "text" as const,
      indicatorHeaders: mChartOV.transformedData.indicatorHeaders,
      mergedStyle: s,
    },
  };

  renderChart(rc, mChartOV, config);

  // Render primitives if they exist
  if (mChartOV.primitives) {
    renderPrimitives(rc, mChartOV.primitives);
  }
}
