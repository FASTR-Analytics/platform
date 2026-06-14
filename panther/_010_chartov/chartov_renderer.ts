// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOV } from "./_internal/measure_chartov.ts";
import { renderChartOV } from "./_internal/render_chartov.ts";
import {
  getChartOVComponentSizes,
  getChartOVSizingData,
} from "./_internal/get_size_info.ts";
import {
  getChartHeightConstraintsByMeasure,
  type HeightConstraints,
  measureChartWithAutofit,
  type PaneLayout,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveScaleAxisPlotHeight,
} from "./deps.ts";
import type {
  ChartOVDataTransformed,
  ChartOVInputs,
  MeasuredChartOV,
} from "./types.ts";

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so content-primitive generation is skipped.
function buildOVProbe(
  rc: RenderContext,
  width: number,
  item: ChartOVInputs,
  data: ChartOVDataTransformed,
): (probeH: number, scale?: number) => PaneLayout[] {
  return (probeH, scale) =>
    measureChartOV(
      rc,
      new RectCoordsDims([0, 0, width, probeH]),
      item,
      scale,
      data,
      true,
    ).paneLayouts;
}

function measureOV(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: ChartOVInputs,
): MeasuredChartOV {
  const data = getChartOVSizingData(item);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    item,
    (scale) => getChartOVComponentSizes(rc, item, data, scale),
    (rc2, b, inp, fitScale) => measureChartOV(rc2, b, inp, fitScale, data),
    buildOVProbe(rc, w, item, data),
    resolveScaleAxisPlotHeight,
  );
}

export const ChartOVRenderer: Renderer<ChartOVInputs, MeasuredChartOV> = {
  isType(item: unknown): item is ChartOVInputs {
    return typeof item === "object" && item !== null && "chartData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOVInputs,
  ): MeasuredChartOV {
    return measureOV(rc, bounds, item);
  },

  render(rc: RenderContext, mChartOV: MeasuredChartOV) {
    renderChartOV(rc, mChartOV);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOVInputs,
  ): void {
    renderChartOV(rc, measureOV(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: ChartOVInputs,
  ): HeightConstraints {
    const data = getChartOVSizingData(item);
    return getChartHeightConstraintsByMeasure(
      rc,
      width,
      item,
      (scale) => getChartOVComponentSizes(rc, item, data, scale),
      buildOVProbe(rc, width, item, data),
      resolveScaleAxisPlotHeight,
    );
  },
};
