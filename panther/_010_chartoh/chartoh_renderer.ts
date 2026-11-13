// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureChartOH } from "./_internal/measure_chartoh.ts";
import { renderChartOH } from "./_internal/render_chartoh.ts";
import {
  getChartOHComponentSizes,
  getChartOHSizingData,
} from "./_internal/get_size_info.ts";
import {
  type ChartComponentSizes,
  countProportionalSlots,
  getChartHeightConstraintsByMeasure,
  getDimensionMembers,
  type HeightConstraints,
  maxNVisible,
  maxProportionalPaneCategoryAxisExtent,
  measureChartWithAutofit,
  type PaneGrid,
  type PaneLayout,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  type ResolveFloorExtent,
  type ResolveTargetExtent,
} from "./deps.ts";
import type { MergedChartOHStyle } from "./deps.ts";
import type {
  ChartOHDataTransformed,
  ChartOHInputs,
  MeasuredChartOH,
} from "./types.ts";

// Real category-label height at the y-text axis wrap width. The real axis wraps
// at pane inner width × pct (measureYTextAxisWidthInfo), so use the probe's
// most-constrained paneInnerWidth — matching what the renderer actually draws.
function maxWrappedCategoryLabelH(
  rc: RenderContext,
  ohStyle: MergedChartOHStyle,
  data: ChartOHDataTransformed,
  probeLayouts: PaneLayout[],
): number {
  const minPaneInnerWidth = Math.min(
    ...probeLayouts.map((l) => l.paneInnerWidth),
  );
  const wrapW = minPaneInnerWidth *
    ohStyle.yTextAxis.maxTickLabelWidthFractionOfPane;
  let maxWrappedH = 0;
  for (const h of data.indicator.members) {
    const mh = rc
      .mText(h.label, ohStyle.yTextAxis.text.yTextAxisTickLabels, wrapW)
      .dims.h();
    if (mh > maxWrappedH) maxWrappedH = mh;
  }
  return maxWrappedH;
}

// Per-sub-chart height for a given per-indicator row height. Mirrors
// minSubChartHeight (get_size_info.ts): the sub-chart height must include the
// inter-row grid strokes (sides mode) so each row's slot is >= its (wrapped)
// label height — without the stroke term, rows are ~stroke/n too short and the
// labels overlap. Floor and natural target share this so they differ only by
// the bar-comfort term.
function ohSubChartHeight(
  info: ChartComponentSizes,
  nIndicators: number,
  targetSlotExtent: number,
): number {
  const ohStyle = info.mergedStyle as MergedChartOHStyle;
  const gridLineStrokeWidth = info.mergedStyle.grid.gridLineStrokeWidth;
  return ohStyle.yTextAxis.tickPosition === "center"
    ? nIndicators * targetSlotExtent
    : nIndicators * targetSlotExtent + gridLineStrokeWidth * (nIndicators + 1);
}

// Do series occupy separate vertical sub-rows? Only for GROUPED bars: the
// renderer splits each bar group nSerieses ways when bars.stacking === "none".
// Stacked/imposed/diff bars overlay, and points/lines/areas overlay — all one
// row. There's no boolean mark flag (marks are per-value getStyle funcs), so we
// sample the bar style per series the way the renderer does: if any series draws
// grouped bars, the bar group is partitioned.
function shouldConsiderNSeries(
  ohStyle: MergedChartOHStyle,
  data: ChartOHDataTransformed,
): boolean {
  if (ohStyle.content.bars.stacking !== "none") return false;
  const seriesMembers = getDimensionMembers(data.series);
  const paneMembers = getDimensionMembers(data.pane);
  const tierMembers = getDimensionMembers(data.tier);
  const laneMembers = getDimensionMembers(data.lane);
  const nSerieses = seriesMembers.length;
  const nValues = data.indicator.members.length;
  const seriesValueArrays = data.values[0]?.[0]?.[0] ?? [];
  for (let i_series = 0; i_series < nSerieses; i_series++) {
    const shown = ohStyle.content.bars.getStyle({
      i_series,
      isFirstSeries: i_series === 0,
      isLastSeries: i_series === nSerieses - 1,
      seriesMember: seriesMembers[i_series],
      nSerieses,
      seriesValueArrays,
      nValues,
      i_pane: 0,
      nPanes: paneMembers.length,
      paneMember: paneMembers[0],
      i_tier: 0,
      nTiers: tierMembers.length,
      tierMember: tierMembers[0],
      i_lane: 0,
      nLanes: laneMembers.length,
      laneMember: laneMembers[0],
      value: seriesValueArrays[i_series]?.[0],
      i_value: 0,
      isFirstValue: true,
      isLastValue: nValues === 1,
      valueMin: 0,
      valueMax: 0,
      indicatorMember: data.indicator.members[0],
    }).show;
    if (shown) return true;
  }
  return false;
}

// ChartOH sub-chart height is category-driven (not a value-axis sub-chart height):
//   nIndicators × max(wrappedLabelH, nBarsPerIndicator × rowThickness) (+ strokes)
// Bar thickness comes from idealHeight.idealRowThickness, which decays with the
// figure's TOTAL bar rows (across all stacked sub-charts) — so dense category
// charts thin their bars rather than growing without bound, and thickness
// stays uniform across stacked sub-charts. The wrapped-label height is a floor:
// an indicator row is never thinner than its (possibly multi-line) label.
function buildOHResolveTarget(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveTargetExtent {
  return (info, probeLayouts, { nRows: nPaneRows, nCols: nPaneCols }) => {
    // Unbalanced membership: size for the fullest pane, not the global union.
    const nIndicators = maxNVisible(
      data.visibleIndicatorsByPane,
      data.indicator.members.length,
    );
    if (nIndicators === 0) return info.minSubChartHeight;
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const nSerieses = getDimensionMembers(data.series).length;
    const nBarsPerIndicator = shouldConsiderNSeries(ohStyle, data)
      ? nSerieses
      : 1;
    // Proportional tier-or-lane layout: the thickness decay sees the true ragged
    // bar-row total (per grid column, matching the uniform formula's
    // one-column semantics); otherwise the uniform product.
    const nTotalBarRows = data.visibleIndicatorsByPaneTier
      ? (countProportionalSlots(data.visibleIndicatorsByPaneTier) / nPaneCols) *
        nBarsPerIndicator
      : nPaneRows * info.nTiers * nIndicators *
        nBarsPerIndicator;
    const rowThickness = info.mergedStyle.idealHeight.idealRowThickness(
      nTotalBarRows,
    );
    const maxWrappedH = maxWrappedCategoryLabelH(
      rc,
      ohStyle,
      data,
      probeLayouts,
    );
    const targetSlotExtent = Math.max(
      maxWrappedH,
      nBarsPerIndicator * rowThickness,
    );
    // Proportional tier-or-lane layout: the target is the fullest pane's TOTAL at
    // this slot thickness, expressed per-tier so the uniform decomposition
    // (× nTiers) recovers the pane total.
    if (data.visibleIndicatorsByPaneTier) {
      return maxProportionalPaneCategoryAxisExtent(
        data.visibleIndicatorsByPaneTier,
        targetSlotExtent,
        ohStyle.yTextAxis.tickPosition === "center",
        info.mergedStyle.grid.gridLineStrokeWidth,
      ) / Math.max(1, info.nTiers);
    }
    return ohSubChartHeight(info, nIndicators, targetSlotExtent);
  };
}

// Legibility FLOOR: the minimum per-sub-chart height at which the category
// labels render without overlapping their neighbours — text only (bars have no
// legibility floor; they may be 1px thin). Differs from the natural target only
// by dropping the bar-comfort term, so floor < natural still holds.
function buildOHResolveFloor(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveFloorExtent {
  return (info, probeLayouts) => {
    // Unbalanced membership: size for the fullest pane, not the global union.
    const nIndicators = maxNVisible(
      data.visibleIndicatorsByPane,
      data.indicator.members.length,
    );
    if (nIndicators === 0) return info.minSubChartHeight;
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const maxWrappedH = maxWrappedCategoryLabelH(
      rc,
      ohStyle,
      data,
      probeLayouts,
    );
    // Proportional tier-or-lane layout: same per-tier expression as the target (see
    // buildOHResolveTarget), floor = wrapped label height only.
    if (data.visibleIndicatorsByPaneTier) {
      return maxProportionalPaneCategoryAxisExtent(
        data.visibleIndicatorsByPaneTier,
        maxWrappedH,
        ohStyle.yTextAxis.tickPosition === "center",
        info.mergedStyle.grid.gridLineStrokeWidth,
      ) / Math.max(1, info.nTiers);
    }
    return ohSubChartHeight(info, nIndicators, maxWrappedH);
  };
}

// Per-SLOT thickness resolvers (proportional panes contract fork): the
// natural slot thickness (wrapped label vs bar-comfort) and its wrapped-
// label floor. Consumed by the ragged decomposition in chart_size_helpers
// when measureChart engages cross-pane proportional sizing; ignored
// otherwise.
function buildOHResolveTargetSlotExtent(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveTargetExtent {
  return (info, probeLayouts, { nCols: nPaneCols }) => {
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const nBarsPerIndicator = shouldConsiderNSeries(ohStyle, data)
      ? getDimensionMembers(data.series).length
      : 1;
    const raggedSlots = data.visibleIndicatorsByPaneTier
      ? countProportionalSlots(data.visibleIndicatorsByPaneTier)
      : data.indicator.members.length * info.nTiers *
        info.nPanes;
    const rowThickness = info.mergedStyle.idealHeight.idealRowThickness(
      (raggedSlots / Math.max(1, nPaneCols)) * nBarsPerIndicator,
    );
    const maxWrappedH = maxWrappedCategoryLabelH(
      rc,
      ohStyle,
      data,
      probeLayouts,
    );
    return Math.max(maxWrappedH, nBarsPerIndicator * rowThickness);
  };
}

function buildOHResolveFloorSlotExtent(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveFloorExtent {
  return (info, probeLayouts) =>
    maxWrappedCategoryLabelH(
      rc,
      info.mergedStyle as MergedChartOHStyle,
      data,
      probeLayouts,
    );
}

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so content-primitive generation is skipped.
function buildOHProbe(
  rc: RenderContext,
  width: number,
  inputs: ChartOHInputs,
  data: ChartOHDataTransformed,
): (probeH: number, paneGrid: PaneGrid, scale?: number) => PaneLayout[] {
  return (probeH, paneGrid, scale) =>
    measureChartOH(
      rc,
      new RectCoordsDims([0, 0, width, probeH]),
      inputs,
      paneGrid,
      scale,
      data,
      true,
    ).paneLayouts;
}

function measureOH(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: ChartOHInputs,
): MeasuredChartOH {
  const data = getChartOHSizingData(inputs);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    inputs,
    (scale) => getChartOHComponentSizes(rc, inputs, data, scale),
    (rc2, b, inp, paneGrid, fitScale) =>
      measureChartOH(rc2, b, inp, paneGrid, fitScale, data),
    buildOHProbe(rc, w, inputs, data),
    buildOHResolveTarget(rc, data),
    buildOHResolveFloor(rc, data),
    buildOHResolveTargetSlotExtent(rc, data),
    buildOHResolveFloorSlotExtent(rc, data),
  );
}

export const ChartOHRenderer: Renderer<ChartOHInputs, MeasuredChartOH> = {
  isType(inputs: unknown): inputs is ChartOHInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "chart-oh";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ChartOHInputs,
  ): MeasuredChartOH {
    return measureOH(rc, bounds, inputs);
  },

  render(rc: RenderContext, mChartOH: MeasuredChartOH) {
    renderChartOH(rc, mChartOH);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: ChartOHInputs,
  ): void {
    renderChartOH(rc, measureOH(rc, bounds, inputs));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: ChartOHInputs,
  ): HeightConstraints {
    const data = getChartOHSizingData(inputs);
    return getChartHeightConstraintsByMeasure(
      rc,
      width,
      inputs,
      (scale) => getChartOHComponentSizes(rc, inputs, data, scale),
      buildOHProbe(rc, width, inputs, data),
      buildOHResolveTarget(rc, data),
      buildOHResolveFloor(rc, data),
      buildOHResolveTargetSlotExtent(rc, data),
      buildOHResolveFloorSlotExtent(rc, data),
    );
  },
};
