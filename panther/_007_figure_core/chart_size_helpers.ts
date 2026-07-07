// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type CustomFigureStyle,
  type FigureFitReport,
  type HeaderItem,
  type HeightConstraints,
  type MergedChartStyleBase,
  RectCoordsDims,
  type RenderContext,
} from "./deps.ts";
import type { FigureInputsBase } from "./types.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";
import type { PaneLayout } from "./measure_types.ts";
import {
  buildFitReport,
  computeFloorScale,
  findFitScaleWithFloor,
  memoizeByScale,
  resolveFigureAutofitOptions,
} from "./autofit.ts";
import { measureSurrounds } from "./_surrounds/measure_surrounds.ts";
import { calculatePaneGrid } from "./dimension_helpers.ts";

// Max per-pane visible member count (indicators, tiers, or lanes) under
// unbalanced membership; the global count when balanced (mask absent).
// Intrinsic sizing reserves space for the fullest pane instead of the
// global union.
export function maxVisibleCount(
  visibleByPane: number[][] | undefined,
  nGlobal: number,
): number {
  if (!visibleByPane || visibleByPane.length === 0) {
    return nGlobal;
  }
  let max = 0;
  for (const visible of visibleByPane) {
    if (visible.length > max) {
      max = visible.length;
    }
  }
  return max;
}

export type ChartComponentSizes = {
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartStyleBase;
  nLanes: number;
  nTiers: number;
  paneHeaders: HeaderItem[];
  minSubChartWidth: number;
  minSubChartHeight: number;
  xAxisHeight: number;
  paneHeaderHeight: number;
  minYAxisWidth: number;
  surroundsMinWidth: number;
  resolvedLegendLabels: LegendInput | undefined;
};

// Each renderer supplies this: turn the figure's content + a probe's layout
// geometry into the natural per-sub-chart plot height (the raw target before
// the legibility-floor clamp). Scale-axis charts (ChartOV, Timeseries) share
// resolveScaleAxisPlotHeight below; ChartOH provides its own (category-driven).
export type ResolveTargetPlotH = (
  info: ChartComponentSizes,
  probeLayouts: PaneLayout[],
) => number;

// Per-renderer legibility-FLOOR plot height: the minimum per-sub-chart height
// at which the renderer's content draws WITHOUT OVERLAP (text wrapped at the
// real wrap width; rotation/caps applied). Same shape as ResolveTargetPlotH but
// a different policy — the floor omits comfort terms (e.g. ideal bar thickness)
// that the natural target reserves. Consumed by the shrink-to-fit decision so it
// reacts to wrapped tick labels. Scale-axis charts don't supply one: their floor
// (minSubChartHeight) is layout-independent and already exact.
export type ResolveFloorPlotH = (
  info: ChartComponentSizes,
  probeLayouts: PaneLayout[],
) => number;

// Natural plot-height resolver for scale-axis charts (ChartOV, Timeseries):
// the idealHeight.idealPlotHeight policy evaluated at the vertically-stacked
// subchart-row count (nPaneRows × nTiers). Layout-independent — probeLayouts
// is unused. Both renderers pass this as their ResolveTargetPlotH.
export function resolveScaleAxisPlotHeight(
  info: ChartComponentSizes,
  _probeLayouts: PaneLayout[],
): number {
  const { nGRows } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );
  return info.mergedStyle.idealHeight.idealPlotHeight(nGRows * info.nTiers);
}

// Legibility-FLOOR resolver for scale-axis charts (ChartOV, Timeseries): the
// per-sub-chart plot floor is the scale-axis minimum, which is layout- and
// scale-independent (no wrapped text in the run direction). Supplying it routes
// the chart through the probe-based fit decision, which makes the OVERHEAD —
// notably the real x-text axis height including rotated/capped tick labels —
// accurate, fixing the unrotated `"Category"`/`"2024"` sample's blind spot.
export function resolveScaleAxisFloorPlotH(
  info: ChartComponentSizes,
  _probeLayouts: PaneLayout[],
): number {
  return info.minSubChartHeight;
}

// Single clamp + finite guard for any ResolveTargetPlotH result. Keeps the
// getIdealHeight and fitReport paths from drifting and turns a NaN/Infinity
// from a custom idealHeight function into a diagnosable error rather than an
// undiagnosable crash deep in axis tick math.
function finalizeTargetPlotH(minSubChartHeight: number, raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new Error(
      `idealHeight function resolved to a non-finite plot height: ${raw}`,
    );
  }
  return Math.max(minSubChartHeight, raw);
}

export function calculateChartMinWidth(info: ChartComponentSizes): number {
  const { nGCols } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );
  const totalSubChartsWidth = info.minSubChartWidth * info.nLanes * nGCols;
  const laneGapsWidth = (info.nLanes - 1) * info.mergedStyle.lanes.gapX *
    nGCols;
  const paneGapsWidth = (nGCols - 1) * info.mergedStyle.panes.gapX;
  const lanePaddingWidth =
    (info.mergedStyle.lanes.paddingLeft + info.mergedStyle.lanes.paddingRight) *
    nGCols;
  const totalYAxisWidth = info.minYAxisWidth * nGCols;
  return (
    totalSubChartsWidth +
    laneGapsWidth +
    paneGapsWidth +
    lanePaddingWidth +
    totalYAxisWidth +
    info.surroundsMinWidth
  );
}

export function calculateChartIdealHeight(
  rc: RenderContext,
  width: number,
  info: ChartComponentSizes,
  inputs: FigureInputsBase,
): number {
  const { nGRows } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );

  const totalSubChartsHeight = info.minSubChartHeight * info.nTiers * nGRows;
  const tierGapsHeight = (info.nTiers - 1) * info.mergedStyle.tiers.gapY *
    nGRows;
  const paneGapsHeight = (nGRows - 1) * info.mergedStyle.panes.gapY;
  const tierPaddingHeight =
    (info.mergedStyle.tiers.paddingTop + info.mergedStyle.tiers.paddingBottom) *
    nGRows;

  let paneHeadersHeight = 0;
  if (!info.mergedStyle.panes.hideHeaders && info.paneHeaders.length > 1) {
    paneHeadersHeight =
      (info.paneHeaderHeight + info.mergedStyle.panes.headerGap) * nGRows;
  }

  const xAxisHeight = info.xAxisHeight * nGRows;

  const dummyBounds = new RectCoordsDims({
    x: 0,
    y: 0,
    w: width,
    h: 9999,
  });
  const mSurrounds = measureSurrounds(
    rc,
    dummyBounds,
    info.customFigureStyle,
    inputs.caption,
    inputs.subCaption,
    inputs.footnote,
    info.resolvedLegendLabels,
  );

  return (
    totalSubChartsHeight +
    tierGapsHeight +
    paneGapsHeight +
    tierPaddingHeight +
    paneHeadersHeight +
    xAxisHeight +
    mSurrounds.extraHeightDueToSurrounds
  );
}

export function measureChartWithAutofit<
  TInputs extends FigureInputsBase,
  TMeasured extends { cramped?: boolean; fitReport?: FigureFitReport },
>(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: TInputs,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
  measureFn: (
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: TInputs,
    fitScale?: number,
  ) => TMeasured,
  // When provided, used to compute the real naturalH for fitReport (the
  // probe-estimate path gives the estimate; this gives the real measure).
  probeMeasure?: (probeH: number, scale?: number) => PaneLayout[],
  // When provided alongside probeMeasure, resolves the natural target for
  // naturalH in the fitReport so it matches getIdealHeight().idealH.
  resolveTargetForReport?: ResolveTargetPlotH,
  // When provided alongside probeMeasure (ChartOH), the shrink-to-fit decision
  // measures the height floor and min-width from real probe layouts instead of
  // the unwrapped/sample estimates, so it reacts to wrapped tick labels.
  resolveFloor?: ResolveFloorPlotH,
): TMeasured {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  if (!autofitOpts) {
    // No shrink-to-fit: lay out at authored DU sizes (fitScale defaults to 1).
    return measureFn(rc, bounds, inputs);
  }

  const getSizes = memoizeByScale(getChartComponentSizes);
  const info1 = getSizes(1.0);
  const baseFontSizeDu = info1.customFigureStyle.baseFontSize;
  const { nGCols, nGRows } = calculatePaneGrid(
    info1.paneHeaders.length,
    info1.mergedStyle.panes.nCols,
  );
  const nTiers = info1.nTiers;

  // Per-scale memoized probe closures, cached across scales. Only built when the
  // probe-based floor path is active (ChartOH).
  const probeByScale = new Map<number, (probeH: number) => PaneLayout[]>();
  function getMemoProbeAtScale(
    scale: number,
  ): (probeH: number) => PaneLayout[] {
    let p = probeByScale.get(scale);
    if (p === undefined) {
      p = memoizeByScale((probeH: number) => probeMeasure!(probeH, scale));
      probeByScale.set(scale, p);
    }
    return p;
  }

  // The autofit decision checks the LEGIBILITY FLOOR (minH semantics), not the
  // natural idealH. This decoupling is Phase B1: a figure may be smaller than
  // natural without shrinking fonts. When the renderer supplies a probe + floor
  // resolver (ChartOH), the floor and min-width are measured from real probe
  // layouts so the decision sees the renderer's true wrapped/real extent (the
  // floor is the no-overlap minimum, not a comfort target). Otherwise
  // (scale-axis charts) the layout-independent estimate is exact.
  const getSizeAtScale = memoizeByScale((scale: number) => {
    const info = getSizes(scale);
    if (!probeMeasure || !resolveFloor) {
      return {
        minWidth: calculateChartMinWidth(info),
        idealHeight: calculateChartIdealHeight(rc, bounds.w(), info, inputs),
      };
    }
    const memoProbe = getMemoProbeAtScale(scale);
    const est = calculateChartIdealHeight(rc, bounds.w(), info, inputs);
    const layouts = memoProbe(est);
    const maxRealYAxisWidth = Math.max(...layouts.map((l) => l.yAxisWidth));
    const floorTarget = finalizeTargetPlotH(
      info.minSubChartHeight,
      resolveFloor(info, layouts),
    );
    return {
      minWidth: calculateChartMinWidthWithRealYAxis(
        info,
        nGCols,
        maxRealYAxisWidth,
      ),
      idealHeight: computeChartIdealHeightByMeasure(
        nGRows,
        nTiers,
        floorTarget,
        memoProbe,
        est,
      ),
    };
  });

  const { fitScale, floorScale, cramped } = findFitScaleWithFloor(
    bounds.w(),
    bounds.h(),
    {
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    },
    getSizeAtScale,
  );

  // Compute real naturalH via the real measure when probeMeasure is provided;
  // use the resolved natural target if resolveTargetForReport is given.
  let naturalHOverride: number | undefined;
  if (probeMeasure) {
    const memoProbe = memoizeByScale((h: number) => probeMeasure(h));
    const estH1 = calculateChartIdealHeight(rc, bounds.w(), info1, inputs);
    let naturalTargetPlotH = info1.minSubChartHeight;
    if (resolveTargetForReport) {
      const initLayouts = memoProbe(estH1);
      naturalTargetPlotH = finalizeTargetPlotH(
        info1.minSubChartHeight,
        resolveTargetForReport(info1, initLayouts),
      );
    }
    naturalHOverride = computeChartIdealHeightByMeasure(
      nGRows,
      nTiers,
      naturalTargetPlotH,
      memoProbe,
      estH1,
    );
  }

  const measured = measureFn(rc, bounds, inputs, fitScale);
  measured.cramped = cramped;
  measured.fitReport = buildFitReport(
    fitScale,
    floorScale,
    cramped,
    getSizeAtScale,
    naturalHOverride,
  );
  return measured;
}

// ---------------------------------------------------------------------------
// Phase A: measure-once-then-decompose
// ---------------------------------------------------------------------------

// Inverts H = overhead(width) + nGRows×nTiers×subChartAreaH to find the total
// figure height at which the minimum sub-chart plot height equals targetPlotH.
//
// The fixed-point iteration handles the one circularity: the Y-axis tick-count
// guess depends on subChartAreaH, which affects overhead (x-label wrap, lane
// headers). Up to MAX_ITER probes; converges in ≤2 for typical figures.
//
// probeMeasure(probeH) runs the real measure at the given height and returns
// the per-pane layouts. Pass a memoized closure — probes are cheap when
// re-called at already-computed heights.
function computeChartIdealHeightByMeasure(
  nGRows: number,
  nTiers: number,
  targetPlotH: number,
  probeMeasure: (probeH: number) => PaneLayout[],
  initialProbeH: number,
): number {
  const MAX_ITER = 3;
  let currentH = Math.max(50, initialProbeH);
  for (let i = 0; i < MAX_ITER; i++) {
    const layouts = probeMeasure(currentH);
    // Use the globally minimum subChartAreaHeight (most-constrained pane).
    // Clamp to 0: when the probe is below overhead (e.g. at the estimate
    // for a figure with tall vertical x-labels), subChartAreaHeight can be
    // negative — treat it as 0 so the overhead is recovered and the iteration
    // converges to overhead + nGRows×nTiers×targetPlotH.
    const minSubChart = Math.max(
      0,
      Math.min(...layouts.map((l) => l.subChartAreaHeight)),
    );
    const overhead = currentH - nGRows * nTiers * minSubChart;
    const nextH = overhead + nGRows * nTiers * targetPlotH;
    if (Math.abs(nextH - currentH) < 0.5) {
      currentH = nextH;
      break;
    }
    currentH = Math.max(50, nextH);
  }
  return currentH;
}

// Computes chart height constraints using real measure probes for idealH and
// minH instead of hand-rolled estimates.
//
// probeMeasure(probeH, scale?) runs the actual measure at the given height and
// scale and returns paneLayouts. Pass a closure that calls the renderer's own
// measure function (e.g. measureChartOV).
//
// resolveTarget: turns the figure's content + a probe's layout into the natural
// per-sub-chart plot height (clamped here to the legibility floor). idealH is
// inverted from it; minH always uses the floor.
export function getChartHeightConstraintsByMeasure<
  TInputs extends FigureInputsBase,
>(
  rc: RenderContext,
  width: number,
  inputs: TInputs,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
  probeMeasure: (probeH: number, scale?: number) => PaneLayout[],
  resolveTarget: ResolveTargetPlotH,
  // When supplied (ChartOH), minH uses the real wrapped-label floor, matching
  // the live fit decision's no-overlap floor instead of the unwrapped estimate.
  resolveFloor?: ResolveFloorPlotH,
): HeightConstraints {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  const getSizes = memoizeByScale(getChartComponentSizes);
  const info = getSizes(1.0);

  const { nGCols, nGRows } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );
  const nTiers = info.nTiers;

  // Memoize probes at scale 1.0 — the fixed-point iteration re-probes the
  // same height after convergence, and buildFitReport re-reads already-probed scales.
  const memoProbe = memoizeByScale((probeH: number) => probeMeasure(probeH));

  // Estimate provides a warm starting point for the fixed-point iteration.
  const estIdealH = calculateChartIdealHeight(rc, width, info, inputs);

  // Resolve the natural target plot height from the idealHeight policy. One probe at
  // the estimate gives the layout geometry ChartOH needs for label wrapping;
  // ChartOV/Timeseries ignore it.
  const initLayouts = memoProbe(estIdealH);
  const targetPlotH = finalizeTargetPlotH(
    info.minSubChartHeight,
    resolveTarget(info, initLayouts),
  );

  const idealH = computeChartIdealHeightByMeasure(
    nGRows,
    nTiers,
    targetPlotH,
    memoProbe,
    estIdealH,
  );

  // Real min-width: use the widest y-axis from the probe layouts.
  const idealLayouts = memoProbe(idealH);
  const maxRealYAxisWidth = Math.max(
    ...idealLayouts.map((l) => l.yAxisWidth),
  );
  // Reconstruct min-width using real y-axis width in place of the estimate.
  const minComfortableWidth = calculateChartMinWidthWithRealYAxis(
    info,
    nGCols,
    maxRealYAxisWidth,
  );
  const neededScalingToFitWidth = width >= minComfortableWidth
    ? 1.0
    : width / minComfortableWidth;

  // maxH = idealH signals "I resist stretching past ideal"; the page layouter
  // owns how far it may actually stretch (content.figureMaxStretch). Stretch is
  // a layout concern, not a figure property.
  const maxH = idealH;

  if (!autofitOpts) {
    return {
      minH: idealH,
      idealH,
      maxH,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  }

  const baseFontSizeDu = info.customFigureStyle.baseFontSize;
  const floorScale = computeFloorScale({
    minScale: autofitOpts.minScale,
    maxScale: autofitOpts.maxScale,
    baseFontSizeDu,
    minFontSizeDu: autofitOpts.minFontSizeDu,
  });
  const infoFloor = getSizes(floorScale);
  const estMinH = calculateChartIdealHeight(rc, width, infoFloor, inputs);
  const memoProbeFloor = memoizeByScale((probeH: number) =>
    probeMeasure(probeH, floorScale)
  );
  // minH uses the legibility floor — the minimum renderable size, not the
  // natural size. When a floor resolver is supplied (ChartOH) it reflects the
  // real wrapped-label height, matching the live fit decision; otherwise the
  // layout-independent minSubChartHeight estimate is exact.
  const targetPlotHFloor = resolveFloor
    ? finalizeTargetPlotH(
      infoFloor.minSubChartHeight,
      resolveFloor(infoFloor, memoProbeFloor(estMinH)),
    )
    : infoFloor.minSubChartHeight;
  const minH = computeChartIdealHeightByMeasure(
    nGRows,
    nTiers,
    targetPlotHFloor,
    memoProbeFloor,
    estMinH,
  );

  return {
    minH,
    idealH,
    maxH,
    neededScalingToFitWidth,
    minComfortableWidth,
  };
}

// calculateChartMinWidth variant that uses the real y-axis width from a probe
// instead of the estimateMinYAxisWidth sample-text estimate.
function calculateChartMinWidthWithRealYAxis(
  info: ChartComponentSizes,
  nGCols: number,
  realYAxisWidth: number,
): number {
  const totalSubChartsWidth = info.minSubChartWidth * info.nLanes * nGCols;
  const laneGapsWidth = (info.nLanes - 1) * info.mergedStyle.lanes.gapX *
    nGCols;
  const paneGapsWidth = (nGCols - 1) * info.mergedStyle.panes.gapX;
  const lanePaddingWidth =
    (info.mergedStyle.lanes.paddingLeft + info.mergedStyle.lanes.paddingRight) *
    nGCols;
  const totalYAxisWidth = realYAxisWidth * nGCols;
  return (
    totalSubChartsWidth +
    laneGapsWidth +
    paneGapsWidth +
    lanePaddingWidth +
    totalYAxisWidth +
    info.surroundsMinWidth
  );
}
