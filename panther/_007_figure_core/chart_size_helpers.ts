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

// Proportional band layout: the fullest pane's categorical plot extent —
// Σ over its bands of (visible slots × perSlot) plus the inter-slot strokes
// in sides mode (Σ_b (n_b + 1) = totalSlots + nBands). Bands with no visible
// indicators are dropped (empty-band policy). Callers divide by their
// reported band count so the uniform decomposition (× nBands) recovers the
// pane total.
export function maxProportionalPanePlotExtent(
  visibleByPaneBand: number[][][],
  perSlot: number,
  centered: boolean,
  gridStrokeWidth: number,
): number {
  let max = 0;
  for (const bands of visibleByPaneBand) {
    const counts = bands.filter((b) => b.length > 0).map((b) => b.length);
    const totalSlots = counts.reduce((a, b) => a + b, 0);
    const strokes = centered
      ? 0
      : gridStrokeWidth * (totalSlots + counts.length);
    max = Math.max(max, totalSlots * perSlot + strokes);
  }
  return max;
}

// Proportional band layout: the true ragged slot total, Σ over all
// (pane, band) of visible indicator counts.
export function proportionalTotalSlots(
  visibleByPaneBand: number[][][],
): number {
  let total = 0;
  for (const bands of visibleByPaneBand) {
    for (const band of bands) {
      total += band.length;
    }
  }
  return total;
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
  // Proportional band layout only: the per-slot minimum along the
  // categorical direction (per-column width floor on OV) and the text-axis
  // tick mode (drives the inter-slot stroke term). Set by the renderers'
  // get_size_info when proportional layout is active.
  minSlotWidth?: number;
  slotTicksCentered?: boolean;
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

// Finite guard for a per-slot target thickness (proportional panes path).
function finalizeSlotT(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new Error(
      `idealHeight function resolved to a non-finite slot thickness: ${raw}`,
    );
  }
  return Math.max(0, raw);
}

// Cross-pane proportional pane sizing: the axis (if any) that measureChart's
// pass 2 stamped on every probe layout. undefined = not engaged (uniform
// pane extents — the shipped decompositions apply).
function proportionalPanesAxisOf(
  layouts: PaneLayout[],
): "width" | "height" | undefined {
  const axis = layouts[0]?.proportionalPanesAxis;
  return axis !== undefined &&
      layouts.every((l) => l.proportionalPanesAxis === axis)
    ? axis
    : undefined;
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
  // Per-SLOT thickness resolvers (proportional panes contract fork): used
  // instead of the per-subchart plot-height resolvers when the probe layouts
  // show cross-pane proportional sizing engaged along the HEIGHT axis. Same
  // shape, different semantics — the ragged decomposition is inverted per
  // slot, not per subchart.
  resolveTargetSlotT?: ResolveTargetPlotH,
  resolveFloorSlotT?: ResolveFloorPlotH,
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
    const paneAxis = proportionalPanesAxisOf(layouts);
    const maxRealYAxisWidth = Math.max(...layouts.map((l) => l.yAxisWidth));
    const minWidth = paneAxis === "width"
      ? calculateChartMinWidthProportionalPanes(info, layouts)
      : calculateChartMinWidthWithRealYAxis(
        info,
        nGCols,
        maxRealYAxisWidth,
      );
    const idealHeight = paneAxis === "height" && resolveFloorSlotT
      ? computeChartIdealHeightProportionalPanes(
        finalizeSlotT(resolveFloorSlotT(info, layouts)),
        info.mergedStyle.grid.gridStrokeWidth,
        info.slotTicksCentered ?? false,
        memoProbe,
        est,
      )
      : computeChartIdealHeightByMeasure(
        nGRows,
        nTiers,
        finalizeTargetPlotH(
          info.minSubChartHeight,
          resolveFloor(info, layouts),
        ),
        memoProbe,
        est,
      );
    return { minWidth, idealHeight };
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
    const initLayouts = memoProbe(estH1);
    if (
      proportionalPanesAxisOf(initLayouts) === "height" && resolveTargetSlotT
    ) {
      naturalHOverride = computeChartIdealHeightProportionalPanes(
        finalizeSlotT(resolveTargetSlotT(info1, initLayouts)),
        info1.mergedStyle.grid.gridStrokeWidth,
        info1.slotTicksCentered ?? false,
        memoProbe,
        estH1,
      );
    } else {
      let naturalTargetPlotH = info1.minSubChartHeight;
      if (resolveTargetForReport) {
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
  // Per-SLOT thickness resolvers — see measureChartWithAutofit.
  resolveTargetSlotT?: ResolveTargetPlotH,
  resolveFloorSlotT?: ResolveFloorPlotH,
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
  const paneAxis = proportionalPanesAxisOf(initLayouts);

  const idealH = paneAxis === "height" && resolveTargetSlotT
    ? computeChartIdealHeightProportionalPanes(
      finalizeSlotT(resolveTargetSlotT(info, initLayouts)),
      info.mergedStyle.grid.gridStrokeWidth,
      info.slotTicksCentered ?? false,
      memoProbe,
      estIdealH,
    )
    : computeChartIdealHeightByMeasure(
      nGRows,
      nTiers,
      finalizeTargetPlotH(
        info.minSubChartHeight,
        resolveTarget(info, initLayouts),
      ),
      memoProbe,
      estIdealH,
    );

  // Real min-width: use the widest y-axis from the probe layouts.
  const idealLayouts = memoProbe(idealH);
  const maxRealYAxisWidth = Math.max(
    ...idealLayouts.map((l) => l.yAxisWidth),
  );
  // Reconstruct min-width using real y-axis width in place of the estimate;
  // proportional OV pane widths sum per-pane totals instead of max × count.
  const minComfortableWidth = proportionalPanesAxisOf(idealLayouts) === "width"
    ? calculateChartMinWidthProportionalPanes(info, idealLayouts)
    : calculateChartMinWidthWithRealYAxis(
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
  const floorLayouts = memoProbeFloor(estMinH);
  let minH: number;
  if (
    proportionalPanesAxisOf(floorLayouts) === "height" && resolveFloorSlotT
  ) {
    minH = computeChartIdealHeightProportionalPanes(
      finalizeSlotT(resolveFloorSlotT(infoFloor, floorLayouts)),
      infoFloor.mergedStyle.grid.gridStrokeWidth,
      infoFloor.slotTicksCentered ?? false,
      memoProbeFloor,
      estMinH,
    );
  } else {
    const targetPlotHFloor = resolveFloor
      ? finalizeTargetPlotH(
        infoFloor.minSubChartHeight,
        resolveFloor(infoFloor, floorLayouts),
      )
      : infoFloor.minSubChartHeight;
    minH = computeChartIdealHeightByMeasure(
      nGRows,
      nTiers,
      targetPlotHFloor,
      memoProbeFloor,
      estMinH,
    );
  }

  return {
    minH,
    idealH,
    maxH,
    neededScalingToFitWidth,
    minComfortableWidth,
  };
}

// Proportional panes, OH (free = HEIGHT): inverts
//   H = overhead + slotT × Σ_(pane,band) nInd + Σ_p strokes_p
// where overhead = H_probe − Σ_p freePlotExtent_p is recovered from a real
// probe (the sum of per-pane overheads, pane gaps, and surrounds). Same
// fixed-point shape as computeChartIdealHeightByMeasure with the true ragged
// coefficient instead of the uniform nGRows×nTiers product — the uniform
// inversion is wrong once pane extents vary with their slot totals.
function computeChartIdealHeightProportionalPanes(
  targetSlotT: number,
  gridStrokeWidth: number,
  centered: boolean,
  probeMeasure: (probeH: number) => PaneLayout[],
  initialProbeH: number,
): number {
  const MAX_ITER = 3;
  let currentH = Math.max(50, initialProbeH);
  for (let i = 0; i < MAX_ITER; i++) {
    const layouts = probeMeasure(currentH);
    let freeTotal = 0;
    let slotsTotal = 0;
    let strokesTotal = 0;
    for (const l of layouts) {
      const bandCount = l.proportionalBandCount ?? 0;
      const slots = l.proportionalSlotTotal ?? 0;
      // Clamp to 0 like the uniform path: below-overhead probes report
      // negative free extents; treat as 0 so overhead is recovered.
      freeTotal += Math.max(0, l.subChartAreaHeight * bandCount);
      slotsTotal += slots;
      strokesTotal += centered ? 0 : gridStrokeWidth * (slots + bandCount);
    }
    const overhead = currentH - freeTotal;
    const nextH = overhead + targetSlotT * slotsTotal + strokesTotal;
    if (Math.abs(nextH - currentH) < 0.5) {
      currentH = nextH;
      break;
    }
    currentH = Math.max(50, nextH);
  }
  return currentH;
}

// Proportional panes, OV (free = WIDTH): a pane row's width is the SUM over
// its panes of (slot total × per-slot width + strokes + lane gaps/padding +
// that pane's own probed y-axis width), not max × count. Mirrors
// calculateChartMinWidth's terms (pane padding is likewise not modeled).
function calculateChartMinWidthProportionalPanes(
  info: ChartComponentSizes,
  layouts: PaneLayout[],
): number {
  const minSlotW = info.minSlotWidth ?? 0;
  const centered = info.slotTicksCentered ?? false;
  const gsw = info.mergedStyle.grid.gridStrokeWidth;
  const lanes = info.mergedStyle.lanes;
  let total = 0;
  for (const l of layouts) {
    const slots = l.proportionalSlotTotal ?? 0;
    const bandCount = l.proportionalBandCount ?? 0;
    total += slots * minSlotW +
      (centered ? 0 : gsw * (slots + bandCount)) +
      Math.max(0, bandCount - 1) * lanes.gapX +
      lanes.paddingLeft + lanes.paddingRight +
      l.yAxisWidth;
  }
  const paneGapsWidth = (layouts.length - 1) * info.mergedStyle.panes.gapX;
  return total + paneGapsWidth + info.surroundsMinWidth;
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
