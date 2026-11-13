// Copyright 2023-2026, Tim Roberton. MIT license.
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
  type PaneGrid,
  type PaneLayout,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveValueAxisFloorSubChartHeight,
  resolveValueAxisSubChartHeight,
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
  inputs: ChartOVInputs,
  data: ChartOVDataTransformed,
): (probeH: number, paneGrid: PaneGrid, scale?: number) => PaneLayout[] {
  return (probeH, paneGrid, scale) =>
    measureChartOV(
      rc,
      new RectCoordsDims([0, 0, width, probeH]),
      inputs,
      paneGrid,
      scale,
      data,
      true,
    ).paneLayouts;
}

function measureOV(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: ChartOVInputs,
): MeasuredChartOV {
  const data = getChartOVSizingData(inputs);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    inputs,
    (scale) => getChartOVComponentSizes(rc, inputs, data, scale),
    (rc2, b, inp, paneGrid, fitScale) =>
      measureChartOV(rc2, b, inp, paneGrid, fitScale, data),
    buildOVProbe(rc, w, inputs, data),
    resolveValueAxisSubChartHeight,
    resolveValueAxisFloorSubChartHeight,
  );
}

export const ChartOVRenderer: Renderer<ChartOVInputs, MeasuredChartOV> = {
  isType(inputs: unknown): inputs is ChartOVInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "chart-ov";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ChartOVInputs,
  ): MeasuredChartOV {
    return measureOV(rc, bounds, inputs);
  },

  render(rc: RenderContext, mChartOV: MeasuredChartOV) {
    renderChartOV(rc, mChartOV);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ChartOVInputs,
  ): void {
    renderChartOV(rc, measureOV(rc, bounds, inputs));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: ChartOVInputs,
  ): HeightConstraints {
    const data = getChartOVSizingData(inputs);
    return getChartHeightConstraintsByMeasure(
      rc,
      width,
      inputs,
      (scale) => getChartOVComponentSizes(rc, inputs, data, scale),
      buildOVProbe(rc, width, inputs, data),
      resolveValueAxisSubChartHeight,
      resolveValueAxisFloorSubChartHeight,
    );
  },
};
