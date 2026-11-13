// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinSubChartHeight,
  type ChartComponentSizes,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateMinYValueAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getDimensionMembers,
  maxNVisible,
  maxProportionalPaneCategoryAxisExtent,
  PANE_HEADER_SAMPLE_MAX_W,
  type RenderContext,
  resolveDefaultLegend,
  SIZING_SAMPLE,
  splitIntoBreakableChunks,
} from "../deps.ts";
import { getChartOVDataTransformed } from "../get_chartov_data.ts";
import type { ChartOVDataTransformed, ChartOVInputs } from "../types.ts";

export function getChartOVSizingData(
  inputs: ChartOVInputs,
): ChartOVDataTransformed {
  const stacked =
    new CustomFigureStyle(inputs.style).getMergedChartOVStyle().content.bars
      .stacking === "stacked";
  return getChartOVDataTransformed(inputs.data, stacked);
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
    .mText(
      SIZING_SAMPLE.textTick,
      ms.xTextAxis.text.xTextAxisTickLabels,
      Infinity,
    )
    .dims.h();
  const xAxisHeight = ms.grid.axisStrokeWidth +
    xAxisTickH +
    ms.xTextAxis.tickLength +
    ms.xTextAxis.tickLabelGap;

  const paneHeaderHeight = rc
    .mText(
      SIZING_SAMPLE.paneHeader,
      ms.text.paneHeaders,
      PANE_HEADER_SAMPLE_MAX_W,
    )
    .dims.h();

  const textStyle = ms.xTextAxis.text.xTextAxisTickLabels;
  const indicatorMembers = data.indicator.members;
  const nIndicators = indicatorMembers.length;

  // Per-column width floor for the x-text axis. The renderer draws the labels
  // differently depending on rotation, so the floor must too (see the sizing
  // invariant in DOC_SIZING_MODEL.md):
  //   - vertical (rotated) labels run UP the column, so a column only needs the
  //     label's horizontal footprint — one line-height — not the word width.
  //   - horizontal labels wrap at the column width, so a column must be at least
  //     as wide as the widest unbreakable chunk or that chunk overflows/clips.
  // (Symmetric known limitation, like the horizontal branch ignoring soft-wrap
  // beyond the widest chunk: a vertical label long enough to wrap past the height
  // cap has a taller footprint than one line; that rare short-chart case is not
  // floored here.)
  let minSlotExtent = 0;
  if (ms.xTextAxis.verticalTickLabels) {
    for (const member of indicatorMembers) {
      const lineH = rc.mText(member.label, textStyle, Infinity).dims.h();
      minSlotExtent = Math.max(minSlotExtent, lineH);
    }
  } else {
    for (const member of indicatorMembers) {
      const chunks = member.label.split("\n").flatMap(splitIntoBreakableChunks);
      for (const chunk of chunks) {
        const mText = rc.mText(chunk.trimEnd(), textStyle, Infinity);
        minSlotExtent = Math.max(minSlotExtent, mText.dims.w());
      }
    }
  }

  // Unbalanced membership: reserve width for the fullest pane, not the
  // global union. minSlotExtent stays measured from the global label set
  // (a safe upper bound for any pane's subset).
  const nSlots = maxNVisible(
    data.visibleIndicatorsByPane,
    nIndicators,
  );
  const gridLineStrokeWidth = ms.grid.gridLineStrokeWidth;
  // Unbalanced lane membership: reserve width for the fullest pane.
  const nLanes = maxNVisible(
    data.visibleLanesByPane,
    getDimensionMembers(data.lane).length,
  );
  // Proportional tier-or-lane layout: the width floor is the fullest pane's TOTAL
  // (slotExtent-model: Σ over its tiers or lanes of visible counts × column width +
  // strokes), expressed per-lane so the uniform decomposition (× nLanes)
  // recovers the pane total. Otherwise the shipped per-tier-or-lane × tier-or-lane count
  // model.
  const minSubChartWidth = data.visibleIndicatorsByPaneLane
    ? maxProportionalPaneCategoryAxisExtent(
      data.visibleIndicatorsByPaneLane,
      minSlotExtent,
      ms.xTextAxis.tickPosition === "center",
      gridLineStrokeWidth,
    ) / Math.max(1, nLanes)
    : ms.xTextAxis.tickPosition === "center"
    ? nSlots * minSlotExtent
    : nSlots * minSlotExtent +
      gridLineStrokeWidth * (nSlots + 1);

  const resolvedLegendLabels = resolveDefaultLegend(
    inputs.legend,
    data.series,
  );

  return {
    customFigureStyle: cs,
    mergedStyle: ms,
    nLanes,
    nTiers: getDimensionMembers(data.tier).length,
    nPanes: getDimensionMembers(data.pane).length,
    minSubChartWidth,
    minSubChartHeight: calculateMinSubChartHeight(rc, ms.yValueAxis),
    xAxisHeight,
    paneHeaderHeight,
    minYAxisWidth: estimateMinYValueAxisWidth(
      rc,
      data.yValueAxisLabel,
      ms.yValueAxis,
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
    // Proportional layout: per-slot width floor + tick mode for the ragged
    // width decomposition (proportional OV pane widths sum per-pane totals).
    minSlotExtent: data.visibleIndicatorsByPaneLane ? minSlotExtent : undefined,
    slotTicksCentered: data.visibleIndicatorsByPaneLane
      ? ms.xTextAxis.tickPosition === "center"
      : undefined,
  };
}
