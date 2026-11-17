// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type CustomFigureStyle,
  type FigureFitReport,
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
import {
  calculateColumnMinWidth,
  type PaneGrid,
  resolvePaneGrid,
} from "./dimension_helpers.ts";

// Max per-pane visible member count (indicators, tiers, or lanes) under
// unbalanced membership; the global count when balanced (mask absent).
// Intrinsic sizing reserves space for the fullest pane instead of the
// global union.
export function maxNVisible(
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

// Proportional tier-or-lane layout: the fullest pane's category-axis extent —
// Σ over its tiers or lanes of (visible slots × slotExtent) plus the inter-slot strokes
// in sides mode (Σ_b (n_b + 1) = nSlots + nTiersOrLanes). Tiers or lanes with no visible
// indicators are dropped (empty tier-or-lane policy). Callers divide by their
// reported tier-or-lane count so the uniform decomposition (× nTiersOrLanes) recovers the
// pane total.
export function maxProportionalPaneCategoryAxisExtent(
  visibleByPaneTierOrLane: number[][][],
  slotExtent: number,
  centered: boolean,
  gridLineStrokeWidth: number,
): number {
  let max = 0;
  for (const tiersOrLanes of visibleByPaneTierOrLane) {
    const counts = tiersOrLanes.filter((b) => b.length > 0).map((b) =>
      b.length
    );
    const nSlots = counts.reduce((a, b) => a + b, 0);
    const strokes = centered
      ? 0
      : gridLineStrokeWidth * (nSlots + counts.length);
    max = Math.max(max, nSlots * slotExtent + strokes);
  }
  return max;
}

// Proportional tier-or-lane layout: the true ragged slot total, Σ over all
// (pane, tier or lane) of visible indicator counts.
export function countProportionalSlots(
  visibleByPaneTierOrLane: number[][][],
): number {
  let total = 0;
  for (const tiersOrLanes of visibleByPaneTierOrLane) {
    for (const tierOrLane of tiersOrLanes) {
      total += tierOrLane.length;
    }
  }
  return total;
}

export type ChartComponentSizes = {
  customFigureStyle: CustomFigureStyle;
  mergedStyle: MergedChartStyleBase;
  nLanes: number;
  nTiers: number;
  nPanes: number;
  minSubChartWidth: number;
  minSubChartHeight: number;
  xAxisHeight: number;
  paneHeaderHeight: number;
  minYAxisWidth: number;
  surroundsMinWidth: number;
  resolvedLegendLabels: LegendInput | undefined;
  // Proportional tier-or-lane layout only: the per-slot minimum along the
  // categorical direction (per-column width floor on OV) and the text-axis
  // tick mode (drives the inter-slot stroke term). Set by the renderers'
  // get_size_info when proportional layout is active.
  minSlotExtent?: number;
  slotTicksCentered?: boolean;
};

// Each renderer supplies this: turn the figure's content + a probe's layout
// geometry into the natural per-sub-chart height (the raw target before
// the legibility-floor clamp). Value-axis charts (ChartOV, Timeseries) share
// resolveValueAxisSubChartHeight below; ChartOH provides its own (category-driven).
// paneGrid is the grid the caller resolved for this scale and width.
export type ResolveTargetExtent = (
  info: ChartComponentSizes,
  probeLayouts: PaneLayout[],
  paneGrid: PaneGrid,
) => number;

// Per-renderer legibility-FLOOR sub-chart height: the minimum per-sub-chart height
// at which the renderer's content draws WITHOUT OVERLAP (text wrapped at the
// real wrap width; rotation/caps applied). Same shape as ResolveTargetExtent but
// a different policy — the floor omits comfort terms (e.g. ideal bar thickness)
// that the natural target reserves. Consumed by the shrink-to-fit decision so it
// reacts to wrapped tick labels. ChartOV supplies resolveValueAxisFloorSubChartHeight so
// the probe path sees its real x-text axis height; Timeseries does not.
export type ResolveFloorExtent = (
  info: ChartComponentSizes,
  probeLayouts: PaneLayout[],
  paneGrid: PaneGrid,
) => number;

// Natural sub-chart-height resolver for value-axis charts (ChartOV, Timeseries):
// the idealHeight.idealSubChartHeight policy evaluated at the vertically-stacked
// sub-chart-row count (nPaneRows × nTiers). Layout-independent — probeLayouts
// is unused. Both renderers pass this as their ResolveTargetExtent.
export function resolveValueAxisSubChartHeight(
  info: ChartComponentSizes,
  _probeLayouts: PaneLayout[],
  paneGrid: PaneGrid,
): number {
  return info.mergedStyle.idealHeight.idealSubChartHeight(
    paneGrid.nRows * info.nTiers,
  );
}

// Legibility-FLOOR resolver for value-axis charts (ChartOV): the
// per-sub-chart floor is the value-axis minimum, which is layout- and
// scale-independent (no wrapped text in the run direction). Supplying it routes
// the chart through the probe-based fit decision, which makes the OVERHEAD —
// notably the real x-text axis height including rotated/capped tick labels —
// accurate, fixing the unrotated `"Category"`/`"2024"` sample's blind spot.
export function resolveValueAxisFloorSubChartHeight(
  info: ChartComponentSizes,
  _probeLayouts: PaneLayout[],
  _paneGrid: PaneGrid,
): number {
  return info.minSubChartHeight;
}

// Single clamp + finite guard for any ResolveTargetExtent result. Keeps the
// getIdealHeight and fitReport paths from drifting and turns a NaN/Infinity
// from a custom idealHeight function into a diagnosable error rather than an
// undiagnosable crash deep in axis tick math.
function finalizeTargetSubChartHeight(
  minSubChartHeight: number,
  raw: number,
): number {
  if (!Number.isFinite(raw)) {
    throw new Error(
      `idealHeight function resolved to a non-finite sub-chart height: ${raw}`,
    );
  }
  return Math.max(minSubChartHeight, raw);
}

// Finite guard for a per-slot target thickness (proportional panes path).
function finalizeSlotExtent(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new Error(
      `idealHeight function resolved to a non-finite slot thickness: ${raw}`,
    );
  }
  return Math.max(0, raw);
}

// Cross-pane proportional pane sizing: the direction (if any) that measureChart's
// pass 2 stamped on every probe layout. undefined = not engaged (uniform
// pane extents — the shipped decompositions apply).
function proportionalPanesDirectionOf(
  layouts: PaneLayout[],
): "width" | "height" | undefined {
  const axis = layouts[0]?.proportionalPanesDirection;
  return axis !== undefined &&
      layouts.every((l) => l.proportionalPanesDirection === axis)
    ? axis
    : undefined;
}

// The column count the chart's minimum width is built from. Under "auto"
// it is one: the smallest width the chart can take is a single stacked
// column, and only when that cannot fit does width force the type to
// shrink. An explicit count is a hard requirement and stays.
function minWidthColumns(info: ChartComponentSizes): number {
  const nCols = info.mergedStyle.panes.nCols;
  return nCols === "auto" ? 1 : nCols;
}

function chartMinWidthAt(
  info: ChartComponentSizes,
  yAxisWidth: number,
): number {
  const nPaneCols = minWidthColumns(info);
  return calculateColumnMinWidth(info, yAxisWidth) * nPaneCols +
    (nPaneCols - 1) * info.mergedStyle.panes.gapX +
    info.surroundsMinWidth;
}

export function calculateChartMinWidth(info: ChartComponentSizes): number {
  return chartMinWidthAt(info, info.minYAxisWidth);
}

export function calculateChartIdealHeight(
  rc: RenderContext,
  width: number,
  info: ChartComponentSizes,
  inputs: FigureInputsBase,
  paneGrid: PaneGrid,
): number {
  const { nRows: nPaneRows } = paneGrid;

  const totalSubChartsHeight = info.minSubChartHeight * info.nTiers * nPaneRows;
  const tierGapsHeight = (info.nTiers - 1) * info.mergedStyle.tiers.gapY *
    nPaneRows;
  const paneGapsHeight = (nPaneRows - 1) * info.mergedStyle.panes.gapY;
  const tierPaddingHeight =
    (info.mergedStyle.tiers.paddingTop + info.mergedStyle.tiers.paddingBottom) *
    nPaneRows;

  let paneHeadersHeight = 0;
  if (!info.mergedStyle.panes.hideHeaders && info.nPanes > 1) {
    paneHeadersHeight =
      (info.paneHeaderHeight + info.mergedStyle.panes.headerGap) * nPaneRows;
  }

  const xAxisHeight = info.xAxisHeight * nPaneRows;

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
    inputs.title,
    inputs.subtitle,
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
    paneGrid: PaneGrid,
    fitScale?: number,
  ) => TMeasured,
  // When provided, used to compute the real naturalH for fitReport (the
  // probe-estimate path gives the estimate; this gives the real measure).
  probeMeasure?: (
    probeH: number,
    paneGrid: PaneGrid,
    scale?: number,
  ) => PaneLayout[],
  // When provided alongside probeMeasure, resolves the natural target for
  // naturalH in the fitReport so it matches getIdealHeight().idealH.
  resolveTargetForReport?: ResolveTargetExtent,
  // When provided alongside probeMeasure, the shrink-to-fit decision
  // measures the height floor and min-width from real probe layouts instead of
  // the unwrapped/sample estimates, so it reacts to wrapped tick labels.
  resolveFloor?: ResolveFloorExtent,
  // Per-SLOT thickness resolvers (proportional panes contract fork): used
  // instead of the per-sub-chart sub-chart-height resolvers when the probe layouts
  // show cross-pane proportional sizing engaged along the HEIGHT direction. Same
  // shape, different semantics — the ragged decomposition is inverted per
  // slot, not per sub-chart.
  resolveTargetSlotExtent?: ResolveTargetExtent,
  resolveFloorSlotExtent?: ResolveFloorExtent,
): TMeasured {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  const getSizes = memoizeByScale(getChartComponentSizes);
  const getGrid = memoizeByScale((scale: number) =>
    resolvePaneGrid(getSizes(scale), bounds.w())
  );
  if (!autofitOpts) {
    // No shrink-to-fit: lay out at authored DU sizes (fitScale defaults to 1).
    return measureFn(rc, bounds, inputs, getGrid(1.0));
  }

  const info1 = getSizes(1.0);
  const grid1 = getGrid(1.0);
  const baseFontSizeDu = info1.customFigureStyle.baseFontSize;
  const nTiers = info1.nTiers;

  // Per-scale memoized probe closures, cached across scales. Only built when the
  // probe-based floor path is active.
  const probeByScale = new Map<number, (probeH: number) => PaneLayout[]>();
  function getMemoProbeAtScale(
    scale: number,
  ): (probeH: number) => PaneLayout[] {
    let p = probeByScale.get(scale);
    if (p === undefined) {
      p = memoizeByScale((probeH: number) =>
        probeMeasure!(probeH, getGrid(scale), scale)
      );
      probeByScale.set(scale, p);
    }
    return p;
  }

  // The autofit decision checks the LEGIBILITY FLOOR (minH semantics), not the
  // natural idealH. This decoupling is Phase B1: a figure may be smaller than
  // natural without shrinking fonts. When the renderer supplies a probe + floor
  // resolver, the floor and min-width are measured from real probe
  // layouts so the decision sees the renderer's true wrapped/real extent (the
  // floor is the no-overlap minimum, not a comfort target).
  const getSizeAtScale = memoizeByScale((scale: number) => {
    const info = getSizes(scale);
    const paneGrid = getGrid(scale);
    if (!probeMeasure || !resolveFloor) {
      return {
        minWidth: calculateChartMinWidth(info),
        idealHeight: calculateChartIdealHeight(
          rc,
          bounds.w(),
          info,
          inputs,
          paneGrid,
        ),
      };
    }
    const memoProbe = getMemoProbeAtScale(scale);
    const est = calculateChartIdealHeight(
      rc,
      bounds.w(),
      info,
      inputs,
      paneGrid,
    );
    const layouts = memoProbe(est);
    const panesDirection = proportionalPanesDirectionOf(layouts);
    const maxRealYAxisWidth = Math.max(...layouts.map((l) => l.yAxisWidth));
    const minWidth = panesDirection === "width"
      ? calculateChartMinWidthProportionalPanes(info, layouts)
      : chartMinWidthAt(info, maxRealYAxisWidth);
    const idealHeight = panesDirection === "height" && resolveFloorSlotExtent
      ? computeChartIdealHeightProportionalPanes(
        finalizeSlotExtent(resolveFloorSlotExtent(info, layouts, paneGrid)),
        info.mergedStyle.grid.gridLineStrokeWidth,
        info.slotTicksCentered ?? false,
        memoProbe,
        est,
      )
      : computeChartIdealHeightByMeasure(
        paneGrid.nRows,
        nTiers,
        finalizeTargetSubChartHeight(
          info.minSubChartHeight,
          resolveFloor(info, layouts, paneGrid),
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
    const memoProbe = memoizeByScale((h: number) => probeMeasure(h, grid1));
    const estH1 = calculateChartIdealHeight(
      rc,
      bounds.w(),
      info1,
      inputs,
      grid1,
    );
    const initLayouts = memoProbe(estH1);
    if (
      proportionalPanesDirectionOf(initLayouts) === "height" &&
      resolveTargetSlotExtent
    ) {
      naturalHOverride = computeChartIdealHeightProportionalPanes(
        finalizeSlotExtent(resolveTargetSlotExtent(info1, initLayouts, grid1)),
        info1.mergedStyle.grid.gridLineStrokeWidth,
        info1.slotTicksCentered ?? false,
        memoProbe,
        estH1,
      );
    } else {
      let naturalTargetSubChartHeight = info1.minSubChartHeight;
      if (resolveTargetForReport) {
        naturalTargetSubChartHeight = finalizeTargetSubChartHeight(
          info1.minSubChartHeight,
          resolveTargetForReport(info1, initLayouts, grid1),
        );
      }
      naturalHOverride = computeChartIdealHeightByMeasure(
        grid1.nRows,
        nTiers,
        naturalTargetSubChartHeight,
        memoProbe,
        estH1,
      );
    }
  }

  const measured = measureFn(rc, bounds, inputs, getGrid(fitScale), fitScale);
  // OR, never overwrite: the figure itself may have flagged starvation (a
  // label budget infeasible even at the legibility floor), and that signal
  // must survive the autofit decision. The autofit-off path above returns
  // measureFn's result untouched, so the figure's own flag survives there
  // without any code.
  const combinedCramped = cramped || measured.cramped === true;
  measured.cramped = combinedCramped;
  measured.fitReport = buildFitReport(
    fitScale,
    floorScale,
    combinedCramped,
    getSizeAtScale,
    naturalHOverride,
  );
  return measured;
}

// ---------------------------------------------------------------------------
// Phase A: measure-once-then-decompose
// ---------------------------------------------------------------------------

// Inverts H = overhead(width) + nPaneRows×nTiers×uniformSubChartHeight to find the total
// figure height at which the minimum sub-chart height equals targetSubChartHeight.
//
// The fixed-point iteration handles the one circularity: the Y-axis tick-count
// guess depends on uniformSubChartHeight, which affects overhead (x-label wrap, lane
// headers). Up to MAX_ITER probes; converges in ≤2 for typical figures.
//
// probeMeasure(probeH) runs the real measure at the given height and returns
// the per-pane layouts. Pass a memoized closure — probes are cheap when
// re-called at already-computed heights.
function computeChartIdealHeightByMeasure(
  nPaneRows: number,
  nTiers: number,
  targetSubChartHeight: number,
  probeMeasure: (probeH: number) => PaneLayout[],
  initialProbeH: number,
): number {
  const MAX_ITER = 3;
  let currentH = Math.max(50, initialProbeH);
  for (let i = 0; i < MAX_ITER; i++) {
    const layouts = probeMeasure(currentH);
    // Use the globally minimum uniformSubChartHeight (most-constrained pane).
    // Clamp to 0: when the probe is below overhead (e.g. at the estimate
    // for a figure with tall vertical x-labels), uniformSubChartHeight can be
    // negative — treat it as 0 so the overhead is recovered and the iteration
    // converges to overhead + nPaneRows×nTiers×targetSubChartHeight.
    const minSubChart = Math.max(
      0,
      Math.min(...layouts.map((l) => l.uniformSubChartHeight)),
    );
    const overhead = currentH - nPaneRows * nTiers * minSubChart;
    const nextH = overhead + nPaneRows * nTiers * targetSubChartHeight;
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
// per-sub-chart height (clamped here to the legibility floor). idealH is
// inverted from it; minH always uses the floor.
export function getChartHeightConstraintsByMeasure<
  TInputs extends FigureInputsBase,
>(
  rc: RenderContext,
  width: number,
  inputs: TInputs,
  getChartComponentSizes: (scale: number) => ChartComponentSizes,
  probeMeasure: (
    probeH: number,
    paneGrid: PaneGrid,
    scale?: number,
  ) => PaneLayout[],
  resolveTarget: ResolveTargetExtent,
  // When supplied, minH is inverted from the renderer's floor through real
  // probes (ChartOH's wrapped-label floor, ChartOV's minSubChartHeight with
  // the real overhead), matching the live fit decision instead of the estimate.
  resolveFloor?: ResolveFloorExtent,
  // Per-SLOT thickness resolvers — see measureChartWithAutofit.
  resolveTargetSlotExtent?: ResolveTargetExtent,
  resolveFloorSlotExtent?: ResolveFloorExtent,
): HeightConstraints {
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  const getSizes = memoizeByScale(getChartComponentSizes);
  const info = getSizes(1.0);
  const paneGrid = resolvePaneGrid(info, width);
  const nTiers = info.nTiers;

  // Memoize probes at scale 1.0 — the fixed-point iteration re-probes the
  // same height after convergence, and buildFitReport re-reads already-probed scales.
  const memoProbe = memoizeByScale((probeH: number) =>
    probeMeasure(probeH, paneGrid)
  );

  // Estimate provides a warm starting point for the fixed-point iteration.
  const estIdealH = calculateChartIdealHeight(
    rc,
    width,
    info,
    inputs,
    paneGrid,
  );

  // Resolve the natural target sub-chart height from the idealHeight policy. One probe at
  // the estimate gives the layout geometry ChartOH needs for label wrapping;
  // ChartOV/Timeseries ignore it.
  const initLayouts = memoProbe(estIdealH);
  const panesDirection = proportionalPanesDirectionOf(initLayouts);

  const idealH = panesDirection === "height" && resolveTargetSlotExtent
    ? computeChartIdealHeightProportionalPanes(
      finalizeSlotExtent(resolveTargetSlotExtent(info, initLayouts, paneGrid)),
      info.mergedStyle.grid.gridLineStrokeWidth,
      info.slotTicksCentered ?? false,
      memoProbe,
      estIdealH,
    )
    : computeChartIdealHeightByMeasure(
      paneGrid.nRows,
      nTiers,
      finalizeTargetSubChartHeight(
        info.minSubChartHeight,
        resolveTarget(info, initLayouts, paneGrid),
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
  // Proportional OV pane widths sum per-pane totals instead of max × count.
  const minComfortableWidth =
    proportionalPanesDirectionOf(idealLayouts) === "width"
      ? calculateChartMinWidthProportionalPanes(info, idealLayouts)
      : chartMinWidthAt(info, maxRealYAxisWidth);
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
  const gridFloor = resolvePaneGrid(infoFloor, width);
  const estMinH = calculateChartIdealHeight(
    rc,
    width,
    infoFloor,
    inputs,
    gridFloor,
  );
  const memoProbeFloor = memoizeByScale((probeH: number) =>
    probeMeasure(probeH, gridFloor, floorScale)
  );
  // minH uses the legibility floor — the minimum renderable size, not the
  // natural size: the renderer's floor through real probes when it supplies a
  // resolver (ChartOH's wrapped-label floor, ChartOV's minSubChartHeight with
  // the real overhead), else the layout-independent minSubChartHeight.
  const floorLayouts = memoProbeFloor(estMinH);
  let minH: number;
  if (
    proportionalPanesDirectionOf(floorLayouts) === "height" &&
    resolveFloorSlotExtent
  ) {
    minH = computeChartIdealHeightProportionalPanes(
      finalizeSlotExtent(
        resolveFloorSlotExtent(infoFloor, floorLayouts, gridFloor),
      ),
      infoFloor.mergedStyle.grid.gridLineStrokeWidth,
      infoFloor.slotTicksCentered ?? false,
      memoProbeFloor,
      estMinH,
    );
  } else {
    const targetSubChartHeightFloor = resolveFloor
      ? finalizeTargetSubChartHeight(
        infoFloor.minSubChartHeight,
        resolveFloor(infoFloor, floorLayouts, gridFloor),
      )
      : infoFloor.minSubChartHeight;
    minH = computeChartIdealHeightByMeasure(
      gridFloor.nRows,
      nTiers,
      targetSubChartHeightFloor,
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
//   H = overhead + slotExtent × Σ_(pane, tier or lane) nInd + Σ_p strokes_p
// where overhead = H_probe − Σ_p freeCategoryAxisExtent_p is recovered from a real
// probe (the sum of per-pane overheads, pane gaps, and surrounds). Same
// fixed-point shape as computeChartIdealHeightByMeasure with the true ragged
// coefficient instead of the uniform nPaneRows×nTiers product — the uniform
// inversion is wrong once pane extents vary with their slot totals.
function computeChartIdealHeightProportionalPanes(
  targetSlotExtent: number,
  gridLineStrokeWidth: number,
  centered: boolean,
  probeMeasure: (probeH: number) => PaneLayout[],
  initialProbeH: number,
): number {
  const MAX_ITER = 3;
  let currentH = Math.max(50, initialProbeH);
  for (let i = 0; i < MAX_ITER; i++) {
    const layouts = probeMeasure(currentH);
    let freeTotal = 0;
    let nSlots = 0;
    let strokesTotal = 0;
    for (const l of layouts) {
      const nTiersOrLanes = l.nProportionalTiersOrLanes ?? 0;
      const slots = l.nProportionalSlots ?? 0;
      // Clamp to 0 like the uniform path: below-overhead probes report
      // negative free extents; treat as 0 so overhead is recovered.
      freeTotal += Math.max(0, l.uniformSubChartHeight * nTiersOrLanes);
      nSlots += slots;
      strokesTotal += centered
        ? 0
        : gridLineStrokeWidth * (slots + nTiersOrLanes);
    }
    const overhead = currentH - freeTotal;
    const nextH = overhead + targetSlotExtent * nSlots + strokesTotal;
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
  const minSlotExtent = info.minSlotExtent ?? 0;
  const centered = info.slotTicksCentered ?? false;
  const gsw = info.mergedStyle.grid.gridLineStrokeWidth;
  const lanes = info.mergedStyle.lanes;
  let total = 0;
  for (const l of layouts) {
    const slots = l.nProportionalSlots ?? 0;
    const nTiersOrLanes = l.nProportionalTiersOrLanes ?? 0;
    total += slots * minSlotExtent +
      (centered ? 0 : gsw * (slots + nTiersOrLanes)) +
      Math.max(0, nTiersOrLanes - 1) * lanes.gapX +
      lanes.paddingLeft + lanes.paddingRight +
      l.yAxisWidth;
  }
  const paneGapsWidth = (layouts.length - 1) * info.mergedStyle.panes.gapX;
  return total + paneGapsWidth + info.surroundsMinWidth;
}
