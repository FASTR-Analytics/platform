// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  MeasuredTimeseries,
  TimeseriesDataTransformed,
  TimeseriesInputs,
} from "./types.ts";

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so content-primitive generation is skipped.
function buildTimeseriesProbe(
  rc: RenderContext,
  width: number,
  item: TimeseriesInputs,
  data: TimeseriesDataTransformed,
): (probeH: number, scale?: number) => PaneLayout[] {
  return (probeH, scale) =>
    measureTimeseries(
      rc,
      new RectCoordsDims([0, 0, width, probeH]),
      item,
      scale,
      data,
      true,
    ).paneLayouts;
}

function measureTS(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: TimeseriesInputs,
): MeasuredTimeseries {
  const data = getTimeseriesSizingData(item);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    item,
    (scale) => getTimeseriesComponentSizes(rc, item, data, scale),
    (rc2, b, inp, fitScale) => measureTimeseries(rc2, b, inp, fitScale, data),
    buildTimeseriesProbe(rc, w, item, data),
    resolveScaleAxisPlotHeight,
  );
}

export const TimeseriesRenderer: Renderer<
  TimeseriesInputs,
  MeasuredTimeseries
> = {
  isType(item: unknown): item is TimeseriesInputs {
    return typeof item === "object" && item !== null &&
      "timeseriesData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TimeseriesInputs,
  ): MeasuredTimeseries {
    return measureTS(rc, bounds, item);
  },

  render(rc: RenderContext, mTimeseries: MeasuredTimeseries) {
    renderTimeseries(rc, mTimeseries);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TimeseriesInputs,
  ): void {
    renderTimeseries(rc, measureTS(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TimeseriesInputs,
  ): HeightConstraints {
    const data = getTimeseriesSizingData(item);
    return getChartHeightConstraintsByMeasure(
      rc,
      width,
      item,
      (scale) => getTimeseriesComponentSizes(rc, item, data, scale),
      buildTimeseriesProbe(rc, width, item, data),
      resolveScaleAxisPlotHeight,
    );
  },
};
