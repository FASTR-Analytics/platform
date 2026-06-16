// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  type RenderContext,
  resolveDefaultLegend,
} from "../deps.ts";
import { getTimeseriesDataTransformed } from "../get_timeseries_data.ts";
import type { TimeseriesDataTransformed, TimeseriesInputs } from "../types.ts";

export function getTimeseriesSizingData(
  inputs: TimeseriesInputs,
): TimeseriesDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedTimeseriesStyle().content.bars
      .stacking === "stacked";
  return getTimeseriesDataTransformed(inputs.timeseriesData, stacked);
}

export function getTimeseriesComponentSizes(
  rc: RenderContext,
  inputs: TimeseriesInputs,
  data: TimeseriesDataTransformed,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const ms = cs.getMergedTimeseriesStyle();

  // xPeriod tick labels are short, fixed-format (years/months) and never wrap
  // or rotate, so this unwrapped sample is a faithful estimate of the real axis
  // height — Timeseries intentionally stays on the estimate fit path (it does
  // not pass a ResolveFloorPlotH). If long/wrapping period labels are ever
  // introduced, route it through the probe like ChartOV (resolveScaleAxisFloorPlotH).
  const xAxisTickH = rc
    .mText("2024", ms.xPeriodAxis.text.xPeriodAxisTickLabels, Infinity)
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xPeriodAxis.periodLabelLargeTopPadding;

  const paneHeaderHeight = rc
    .mText("Region 001", ms.text.paneHeaders, 400)
    .dims.h();

  const minSubChartWidth = calculateTimeseriesMinSubChartWidth(
    data.nTimePoints,
    xAxisTickH,
  );

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.seriesHeaders,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: data.laneHeaders.length,
    nTiers: data.tierHeaders.length,
    paneHeaders: data.paneHeaders,
    minSubChartWidth,
    minSubChartHeight: calculateMinSubChartHeight(rc, ms.yScaleAxis),
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth: estimateMinYAxisWidth(rc, ms.yScaleAxis, ms.grid),
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      cs,
      resolvedLegendLabels,
      data.seriesHeaders,
    ),
    resolvedLegendLabels,
  };
}
