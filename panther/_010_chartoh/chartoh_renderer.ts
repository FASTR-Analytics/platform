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
  getChartHeightConstraintsByMeasure,
  type HeightConstraints,
  measureChartWithAutofit,
  type PaneLayout,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  type ResolveTargetPlotH,
} from "./deps.ts";
import type { MergedChartOHStyle } from "./deps.ts";
import type {
  ChartOHDataTransformed,
  ChartOHInputs,
  MeasuredChartOH,
} from "./types.ts";

// ChartOH subchart height is category-driven (not a scale-axis plot height):
//   nIndicators × max(wrappedLabelH, nBarsPerIndicator × rowThickness)
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
    const nIndicators = data.indicatorHeaders.length;
    if (nIndicators === 0) return info.minSubChartHeight;
    const ohStyle = info.mergedStyle as MergedChartOHStyle;
    const nSeries = data.seriesHeaders.length;
    const stacked = info.mergedStyle.content.bars.stacking === "stacked";
    const nBarsPerIndicator = stacked ? 1 : nSeries;
    const { nGRows } = calculatePaneGrid(
      info.paneHeaders.length,
      info.mergedStyle.panes.nCols,
    );
    const nTotalBarRows = nGRows * info.nTiers * nIndicators *
      nBarsPerIndicator;
    const rowThickness = info.mergedStyle.idealHeight.idealRowThickness(
      nTotalBarRows,
    );
    // maxWrappedCategoryLabelH: real label height at the y-text axis wrap
    // width. The real axis wraps at pane content width × pct
    // (measureYTextAxisWidthInfo), so use the probe's paneContentWidth.
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
    const perIndicatorH = Math.max(
      maxWrappedH,
      nBarsPerIndicator * rowThickness,
    );
    return nIndicators * perIndicatorH;
  };
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
    );
  },
};
