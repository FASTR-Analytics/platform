// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  calculatePaneGrid,
  type ChartComponentSizes,
  getChartHeightConstraintsByMeasure,
  type HeightConstraints,
  maxProportionalPanePlotExtent,
  maxVisibleCount,
  measureChartWithAutofit,
  type PaneLayout,
  proportionalTotalSlots,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  type ResolveFloorPlotH,
  type ResolveTargetPlotH,
} from "./deps.ts";
import type { HeaderItem, MergedChartOHStyle } from "./deps.ts";
import type {
  ChartOHDataTransformed,
  ChartOHInputs,
  MeasuredChartOH,
} from "./types.ts";

// Real category-label height at the y-text axis wrap width. The real axis wraps
// at pane content width × pct (measureYTextAxisWidthInfo), so use the probe's
// most-constrained paneContentWidth — matching what the renderer actually draws.
function maxWrappedCategoryLabelH(
  rc: RenderContext,
  ohStyle: MergedChartOHStyle,
  data: ChartOHDataTransformed,
  probeLayouts: PaneLayout[],
): number {
  const minPaneContentW = Math.min(
    ...probeLayouts.map((l) => l.paneContentWidth),
  );
  const wrapW = minPaneContentW *
    ohStyle.yTextAxis.maxTickLabelWidthAsPctOfChart;
  let maxWrappedH = 0;
  for (const h of data.indicatorHeaders) {
    const mh = rc
      .mText(h.label, ohStyle.yTextAxis.text.yTextAxisTickLabels, wrapW)
      .dims.h();
    if (mh > maxWrappedH) maxWrappedH = mh;
  }
  return maxWrappedH;
}

// Per-sub-chart plot height for a given per-indicator row height. Mirrors
// minSubChartHeight (get_size_info.ts): the sub-chart height must include the
// inter-row grid strokes (sides mode) so each row's slot is >= its (wrapped)
// label height — without the stroke term, rows are ~stroke/n too short and the
// labels overlap. Floor and natural target share this so they differ only by
// the bar-comfort term.
function ohPerSubChartPlotH(
  info: ChartComponentSizes,
  nIndicators: number,
  perIndicatorH: number,
): number {
  const ohStyle = info.mergedStyle as MergedChartOHStyle;
  const gridStrokeWidth = info.mergedStyle.grid.gridStrokeWidth;
  return ohStyle.yTextAxis.tickPosition === "center"
    ? nIndicators * perIndicatorH
    : nIndicators * perIndicatorH + gridStrokeWidth * (nIndicators + 1);
}

// Do series occupy separate vertical sub-rows? Only for GROUPED bars: the
// renderer splits each indicator band nSeries ways when bars.stacking === "none".
// Stacked/imposed/diff bars overlay, and points/lines/areas overlay — all one
// row. There's no boolean mark flag (marks are per-value getStyle funcs), so we
// sample the bar style per series the way the renderer does: if any series draws
// grouped bars, the band is partitioned.
function shouldConsiderNSeries(
  ohStyle: MergedChartOHStyle,
  data: ChartOHDataTransformed,
): boolean {
  if (ohStyle.content.bars.stacking !== "none") return false;
  const nSeries = data.seriesHeaders.length;
  const nVals = data.indicatorHeaders.length;
  const seriesValArrays = data.values[0]?.[0]?.[0] ?? [];
  const fb: HeaderItem = { id: "", label: "" };
  for (let i_series = 0; i_series < nSeries; i_series++) {
    const shown = ohStyle.content.bars.getStyle({
      i_series,
      isFirstSeries: i_series === 0,
      isLastSeries: i_series === nSeries - 1,
      seriesHeader: data.seriesHeaders[i_series] ?? fb,
      nSerieses: nSeries,
      seriesValArrays,
      nVals,
      i_pane: 0,
      nPanes: data.paneHeaders.length,
      paneHeader: data.paneHeaders[0] ?? fb,
      i_tier: 0,
      nTiers: data.tierHeaders.length,
      tierHeader: data.tierHeaders[0] ?? fb,
      i_lane: 0,
      nLanes: data.laneHeaders.length,
      laneHeader: data.laneHeaders[0] ?? fb,
      val: seriesValArrays[i_series]?.[0],
      i_val: 0,
      isFirstVal: true,
      isLastVal: nVals === 1,
      valueMin: 0,
      valueMax: 0,
      indicatorHeader: data.indicatorHeaders[0] ?? fb,
    }).show;
    if (shown) return true;
  }
  return false;
}

// ChartOH subchart height is category-driven (not a scale-axis plot height):
//   nIndicators × max(wrappedLabelH, nBarsPerIndicator × rowThickness) (+ strokes)
// Bar thickness comes from idealHeight.idealRowThickness, which decays with the
// figure's TOTAL bar rows (across all stacked subcharts) — so dense category
// charts thin their bars rather than growing without bound, and thickness
// stays uniform across stacked subcharts. The wrapped-label height is a floor:
// an indicator row is never thinner than its (possibly multi-line) label.
function buildOHResolveTarget(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveTargetPlotH {
  return (info, probeLayouts) => {
    // Unbalanced membership: size for the fullest pane, not the global union.
    const nIndicators = maxVisibleCount(
      data.visibleIndicatorsByPane,
      data.indicatorHeaders.length,
    );
    if (nIndicators === 0) return info.minSubChartHeight;
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const nSeries = data.seriesHeaders.length;
    const nBarsPerIndicator = shouldConsiderNSeries(ohStyle, data)
      ? nSeries
      : 1;
    const { nGRows, nGCols } = calculatePaneGrid(
      info.paneHeaders.length,
      info.mergedStyle.panes.nCols,
    );
    // Proportional band layout: the thickness decay sees the true ragged
    // bar-row total (per grid column, matching the uniform formula's
    // one-column semantics); otherwise the uniform product.
    const nTotalBarRows = data.visibleIndicatorsByPaneBand
      ? (proportionalTotalSlots(data.visibleIndicatorsByPaneBand) / nGCols) *
        nBarsPerIndicator
      : nGRows * info.nTiers * nIndicators *
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
    const perIndicatorH = Math.max(
      maxWrappedH,
      nBarsPerIndicator * rowThickness,
    );
    // Proportional band layout: the target is the fullest pane's TOTAL at
    // this slot thickness, expressed per-tier so the uniform decomposition
    // (× nTiers) recovers the pane total.
    if (data.visibleIndicatorsByPaneBand) {
      return maxProportionalPanePlotExtent(
        data.visibleIndicatorsByPaneBand,
        perIndicatorH,
        ohStyle.yTextAxis.tickPosition === "center",
        info.mergedStyle.grid.gridStrokeWidth,
      ) / Math.max(1, info.nTiers);
    }
    return ohPerSubChartPlotH(info, nIndicators, perIndicatorH);
  };
}

// Legibility FLOOR: the minimum per-sub-chart height at which the category
// labels render without overlapping their neighbours — text only (bars have no
// legibility floor; they may be 1px thin). Differs from the natural target only
// by dropping the bar-comfort term, so floor < natural still holds.
function buildOHResolveFloor(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveFloorPlotH {
  return (info, probeLayouts) => {
    // Unbalanced membership: size for the fullest pane, not the global union.
    const nIndicators = maxVisibleCount(
      data.visibleIndicatorsByPane,
      data.indicatorHeaders.length,
    );
    if (nIndicators === 0) return info.minSubChartHeight;
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const maxWrappedH = maxWrappedCategoryLabelH(
      rc,
      ohStyle,
      data,
      probeLayouts,
    );
    // Proportional band layout: same per-tier expression as the target (see
    // buildOHResolveTarget), floor = wrapped label height only.
    if (data.visibleIndicatorsByPaneBand) {
      return maxProportionalPanePlotExtent(
        data.visibleIndicatorsByPaneBand,
        maxWrappedH,
        ohStyle.yTextAxis.tickPosition === "center",
        info.mergedStyle.grid.gridStrokeWidth,
      ) / Math.max(1, info.nTiers);
    }
    return ohPerSubChartPlotH(info, nIndicators, maxWrappedH);
  };
}

// Per-SLOT thickness resolvers (proportional panes contract fork): the
// natural slot thickness (wrapped label vs bar-comfort) and its wrapped-
// label floor. Consumed by the ragged decomposition in chart_size_helpers
// when measureChart engages cross-pane proportional sizing; ignored
// otherwise.
function buildOHResolveTargetSlotT(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveTargetPlotH {
  return (info, probeLayouts) => {
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const nBarsPerIndicator = shouldConsiderNSeries(ohStyle, data)
      ? data.seriesHeaders.length
      : 1;
    const { nGCols } = calculatePaneGrid(
      info.paneHeaders.length,
      info.mergedStyle.panes.nCols,
    );
    const raggedSlots = data.visibleIndicatorsByPaneBand
      ? proportionalTotalSlots(data.visibleIndicatorsByPaneBand)
      : data.indicatorHeaders.length * info.nTiers *
        info.paneHeaders.length;
    const rowThickness = info.mergedStyle.idealHeight.idealRowThickness(
      (raggedSlots / Math.max(1, nGCols)) * nBarsPerIndicator,
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

function buildOHResolveFloorSlotT(
  rc: RenderContext,
  data: ChartOHDataTransformed,
): ResolveFloorPlotH {
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
  item: ChartOHInputs,
  data: ChartOHDataTransformed,
): (probeH: number, scale?: number) => PaneLayout[] {
  return (probeH, scale) =>
    measureChartOH(
      rc,
      new RectCoordsDims([0, 0, width, probeH]),
      item,
      scale,
      data,
      true,
    ).paneLayouts;
}

function measureOH(
  rc: RenderContext,
  bounds: RectCoordsDims,
  item: ChartOHInputs,
): MeasuredChartOH {
  const data = getChartOHSizingData(item);
  const w = bounds.w();
  return measureChartWithAutofit(
    rc,
    bounds,
    item,
    (scale) => getChartOHComponentSizes(rc, item, data, scale),
    (rc2, b, inp, fitScale) => measureChartOH(rc2, b, inp, fitScale, data),
    buildOHProbe(rc, w, item, data),
    buildOHResolveTarget(rc, data),
    buildOHResolveFloor(rc, data),
    buildOHResolveTargetSlotT(rc, data),
    buildOHResolveFloorSlotT(rc, data),
  );
}

export const ChartOHRenderer: Renderer<ChartOHInputs, MeasuredChartOH> = {
  isType(item: unknown): item is ChartOHInputs {
    return typeof item === "object" && item !== null && "chartOHData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOHInputs,
  ): MeasuredChartOH {
    return measureOH(rc, bounds, item);
  },

  render(rc: RenderContext, mChartOH: MeasuredChartOH) {
    renderChartOH(rc, mChartOH);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: ChartOHInputs,
  ): void {
    renderChartOH(rc, measureOH(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: ChartOHInputs,
  ): HeightConstraints {
    const data = getChartOHSizingData(item);
    return getChartHeightConstraintsByMeasure(
      rc,
      width,
      item,
      (scale) => getChartOHComponentSizes(rc, item, data, scale),
      buildOHProbe(rc, width, item, data),
      buildOHResolveTarget(rc, data),
      buildOHResolveFloor(rc, data),
      buildOHResolveTargetSlotT(rc, data),
      buildOHResolveFloorSlotT(rc, data),
    );
  },
};
