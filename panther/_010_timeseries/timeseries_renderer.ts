// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTimeseries } from "./_internal/measure_timeseries.ts";
import { renderTimeseries } from "./_internal/render_timeseries.ts";
import {
  getTimeseriesComponentSizes,
  getTimeseriesSizingData,
} from "./_internal/get_size_info.ts";
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
import type {
  MeasuredTimeseries,
  TimeseriesDataTransformed,
  TimeseriesInputs,
} from "./types.ts";

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so content-primitive generation is skipped.
function buildTimeseriesProbeSizing(
  rc: RenderContext,
  width: number,
  inputs: TimeseriesInputs,
  data: TimeseriesDataTransformed,
): ChartProbeSizing {
  return {
    probeMeasure: (probeH, paneGrid, scale) =>
      measureTimeseries(
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

function measureTS(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: TimeseriesInputs,
): MeasuredTimeseries {
  const data = getTimeseriesSizingData(inputs);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    inputs,
    (scale) => getTimeseriesComponentSizes(rc, inputs, data, scale),
    (rc2, b, inp, paneGrid, fitScale) =>
      measureTimeseries(rc2, b, inp, paneGrid, fitScale, data),
    buildTimeseriesProbeSizing(rc, w, inputs, data),
  );
}

export const TimeseriesRenderer: Renderer<
  TimeseriesInputs,
  MeasuredTimeseries
> = {
  isType(inputs: unknown): inputs is TimeseriesInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "timeseries";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: TimeseriesInputs,
  ): MeasuredTimeseries {
    return measureTS(rc, bounds, inputs);
  },

  render(rc: RenderContext, mTimeseries: MeasuredTimeseries) {
    renderTimeseries(rc, mTimeseries);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: TimeseriesInputs,
  ): void {
    renderTimeseries(rc, measureTS(rc, bounds, inputs));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: TimeseriesInputs,
  ): SizeConstraints {
    const data = getTimeseriesSizingData(inputs);
    return getChartSizeConstraintsByMeasure(
      rc,
      width,
      inputs,
      (scale) => getTimeseriesComponentSizes(rc, inputs, data, scale),
      buildTimeseriesProbeSizing(rc, width, inputs, data),
    );
  },
};
