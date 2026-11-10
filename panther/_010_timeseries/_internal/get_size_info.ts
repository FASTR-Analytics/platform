// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYScaleAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  PANE_HEADER_SAMPLE_MAX_W,
  type RenderContext,
  resolveDefaultLegend,
  SIZING_SAMPLE,
  slotHeaders,
} from "../deps.ts";
import { getTimeseriesDataTransformed } from "../get_timeseries_data.ts";
import type { TimeseriesDataTransformed, TimeseriesInputs } from "../types.ts";

export function getTimeseriesSizingData(
  inputs: TimeseriesInputs,
): TimeseriesDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedTimeseriesStyle().content.bars
      .stacking === "stacked";
  return getTimeseriesDataTransformed(inputs.data, stacked);
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
    .mText(
      SIZING_SAMPLE.periodTick,
      ms.xPeriodAxis.text.xPeriodAxisTickLabels,
      Infinity,
    )
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xPeriodAxis.periodLabelLargeTopPadding;

  const paneHeaderHeight = rc
    .mText(
      SIZING_SAMPLE.paneHeader,
      ms.text.paneHeaders,
      PANE_HEADER_SAMPLE_MAX_W,
    )
    .dims.h();

  const minSubChartWidth = calculateTimeseriesMinSubChartWidth(
    data.period.nTimePoints,
    xAxisTickH,
  );

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.series,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes: slotHeaders(data.lane).length,
    nTiers: slotHeaders(data.tier).length,
    nPanes: slotHeaders(data.pane).length,
    minSubChartWidth,
    minSubChartHeight: calculateMinSubChartHeight(rc, ms.yScaleAxis),
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth: estimateMinYScaleAxisWidth(
      rc,
      data.yScaleAxisLabel,
      ms.yScaleAxis,
      ms.grid,
      estimateTierHeaderAndLabelGapWidth(rc, data.tier, data.lane, ms),
    ),
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      cs,
      resolvedLegendLabels,
      data.series,
    ),
    resolvedLegendLabels,
  };
}
