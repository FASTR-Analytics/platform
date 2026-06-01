// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureTimeseries } from "./_internal/measure_timeseries.ts";
import { renderTimeseries } from "./_internal/render_timeseries.ts";
import { getTimeseriesComponentSizes } from "./_internal/get_size_info.ts";
import {
  getChartHeightConstraints,
  type HeightConstraints,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
} from "./deps.ts";
import type { MeasuredTimeseries, TimeseriesInputs } from "./types.ts";

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
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getTimeseriesComponentSizes(rc, item, scale),
      measureTimeseries,
    );
  },

  render(rc: RenderContext, mTimeseries: MeasuredTimeseries) {
    renderTimeseries(rc, mTimeseries);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: TimeseriesInputs,
  ): void {
    const measured = measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getTimeseriesComponentSizes(rc, item, scale),
      measureTimeseries,
    );
    renderTimeseries(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: TimeseriesInputs,
  ): HeightConstraints {
    return getChartHeightConstraints(
      rc,
      width,
      item,
      (scale) => getTimeseriesComponentSizes(rc, item, scale),
    );
  },
};
