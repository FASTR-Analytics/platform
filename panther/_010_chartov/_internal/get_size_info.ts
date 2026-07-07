// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartHeight,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  maxVisibleCount,
  type RenderContext,
  resolveDefaultLegend,
} from "../deps.ts";
import { getChartOVDataTransformed } from "../get_chartov_data.ts";
import type { ChartOVDataTransformed, ChartOVInputs } from "../types.ts";

export function getChartOVSizingData(
  inputs: ChartOVInputs,
): ChartOVDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedChartOVStyle().content.bars
      .stacking === "stacked";
  return getChartOVDataTransformed(inputs.chartData, stacked);
}

export function getChartOVComponentSizes(
  rc: RenderContext,
  inputs: ChartOVInputs,
  data: ChartOVDataTransformed,
  scale?: number,
): ChartComponentSizes {
  const cs = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const ms = cs.getMergedChartOVStyle();

  const xAxisTickH = rc
    .mText("Category", ms.xTextAxis.text.xTextAxisTickLabels, Infinity)
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xTextAxis.tickHeight +
    ms.xTextAxis.tickLabelGap;

  const paneHeaderHeight = rc
    .mText("Region 001", ms.text.paneHeaders, 400)
    .dims.h();

  const textStyle = ms.xTextAxis.text.xTextAxisTickLabels;
  const indicatorHeaders = data.indicatorHeaders;
  const nIndicators = indicatorHeaders.length;

  // Per-column width floor for the x-text axis. The renderer draws the labels
  // differently depending on rotation, so the floor must too (see the sizing
  // invariant in DOC_SIZING_MODEL.md):
  //   - vertical (rotated) labels run UP the column, so a column only needs the
  //     label's horizontal footprint — one line-height — not the word width.
  //   - horizontal labels wrap at the column width, so a column must be at least
  //     as wide as the widest single word or that word overflows/clips.
  // (Symmetric known limitation, like the horizontal branch ignoring soft-wrap
  // beyond the widest word: a vertical label long enough to wrap past the height
  // cap has a taller footprint than one line; that rare short-chart case is not
  // floored here.)
  let perColumnWidth = 0;
  if (ms.xTextAxis.verticalTickLabels) {
    for (const header of indicatorHeaders) {
      const lineH = rc.mText(header.label, textStyle, Infinity).dims.h();
      perColumnWidth = Math.max(perColumnWidth, lineH);
    }
  } else {
    for (const header of indicatorHeaders) {
      const words = header.label.split(/\s+/);
      for (const word of words) {
        if (word.length === 0) continue;
        const mText = rc.mText(word, textStyle, Infinity);
        perColumnWidth = Math.max(perColumnWidth, mText.dims.w());
      }
    }
  }

  // Unbalanced membership: reserve width for the fullest pane, not the
  // global union. perColumnWidth stays measured from the global label set
  // (a safe upper bound for any pane's subset).
  const nIndicatorSlots = maxVisibleCount(
    data.visibleIndicatorsByPane,
    nIndicators,
  );
  const gridStrokeWidth = ms.grid.gridStrokeWidth;
  const minSubChartWidth = ms.xTextAxis.tickPosition === "center"
    ? nIndicatorSlots * perColumnWidth
    : nIndicatorSlots * perColumnWidth +
      gridStrokeWidth * (nIndicatorSlots + 1);

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.seriesHeaders,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    // Unbalanced lane membership: reserve width for the fullest pane.
    nLanes: maxVisibleCount(data.visibleLanesByPane, data.laneHeaders.length),
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
