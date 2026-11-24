// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getScatterComponentSizes } from "./_internal/get_size_info.ts";
import { measureScatter } from "./_internal/measure_scatter.ts";
import { renderScatter } from "./_internal/render_scatter.ts";
import {
  type ChartProbeSizing,
  getChartSizeConstraintsByMeasure,
  measureChartWithAutofit,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveValueAxisSubChartHeight,
  type SizeConstraints,
} from "./deps.ts";
import { getScatterDataTransformed } from "./get_scatter_data.ts";
import type {
  MeasuredScatter,
  ScatterDataTransformed,
  ScatterInputs,
} from "./types.ts";

export const ScatterRenderer: Renderer<ScatterInputs, MeasuredScatter> = {
  isType(inputs: unknown): inputs is ScatterInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "scatter";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ScatterInputs,
  ): MeasuredScatter {
    return measureScatterWithAutofit(rc, bounds, inputs);
  },

  render(rc: RenderContext, measured: MeasuredScatter) {
    renderScatter(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ScatterInputs,
  ): void {
    renderScatter(rc, measureScatterWithAutofit(rc, bounds, inputs));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: ScatterInputs,
  ): SizeConstraints {
    const data = getScatterDataTransformed(inputs.data);
    return getChartSizeConstraintsByMeasure(
      rc,
      width,
      inputs,
      (scale) => getScatterComponentSizes(rc, inputs, data, scale),
      buildScatterProbeSizing(rc, width, inputs, data),
    );
  },
};

function measureScatterWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: ScatterInputs,
): MeasuredScatter {
  const data = getScatterDataTransformed(inputs.data);
  return measureChartWithAutofit(
    rc,
    bounds,
    inputs,
    (scale) => getScatterComponentSizes(rc, inputs, data, scale),
    (rc2, b, inp, paneGrid, fitScale) =>
      measureScatter(rc2, b, inp, paneGrid, fitScale, data),
    buildScatterProbeSizing(rc, bounds.w(), inputs, data),
  );
}

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so content-primitive generation is skipped.
function buildScatterProbeSizing(
  rc: RenderContext,
  width: number,
  inputs: ScatterInputs,
  data: ScatterDataTransformed,
): ChartProbeSizing {
  return {
    probeMeasure: (probeH, paneGrid, scale) =>
      measureScatter(
        rc,
        new RectCoordsDims([0, 0, width, probeH]),
        inputs,
        paneGrid,
        scale,
        data,
        true,
      ).paneLayouts,
    resolveTarget: resolveValueAxisSubChartHeight,
  };
}
