// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelSubChartExtent,
  type ChartComponentSizes,
  computeFloorScale,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  getDimensionMembers,
  type HeightConstraints,
  type LegendInput,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveDefaultLegend,
  resolveFigureAutofitOptions,
  resolvePaneGrid,
  SIZING_SAMPLE,
} from "./deps.ts";
import type { MeasuredPie, PieInputs } from "./types.ts";
import { getPieDataTransformed } from "./get_pie_data.ts";
import { calculatePieLabelFloorBudget } from "./_internal/generate_pie_label_candidates.ts";
import {
  allPieIndices,
  buildSlotObjectiveContext,
  idealSubChartHeightAt,
  maxSlicesPerPie,
  resolveIdealSlotCols,
  showsIndicatorHeaders,
} from "./_internal/indicator_slots.ts";
import { measurePie } from "./_internal/measure_pie.ts";
import { renderPie } from "./_internal/render_pie.ts";

export const PieRenderer: Renderer<PieInputs, MeasuredPie> = {
  isType(inputs: unknown): inputs is PieInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "pie";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PieInputs,
  ): MeasuredPie {
    return measureChartWithAutofit(
      rc,
      bounds,
      inputs,
      (scale) => getPieComponentSizes(rc, inputs, scale),
      measurePie,
    );
  },

  render(rc: RenderContext, measured: MeasuredPie): void {
    renderPie(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PieInputs,
  ): void {
    this.render(rc, this.measure(rc, bounds, inputs));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: PieInputs,
  ): HeightConstraints {
    return getPieIdealHeight(rc, width, inputs);
  },
};

export function getPieComponentSizes(
  rc: RenderContext,
  inputs: PieInputs,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedPieStyle();
  const transformedData = getPieDataTransformed(inputs.data);

  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. The floors are not equal per direction:
  // outside labels add width (the flank gutters) and can add height (a flank
  // stack taller than the content). Both label terms are unwrapped, so each
  // floor stays proportional to the scale (monotone) and free of any slot
  // dependence.
  //
  // The content floor itself is applied to BOTH dimensions regardless of the
  // silhouette, so a gauge — which needs only half the height its width implies
  // — gets a slightly generous height floor. Deliberate: a legibility floor that
  // is too generous only makes autofit cautious, and the ideal-height pass
  // (which does read the silhouette) is what sets the natural size.
  //
  // The gap term is geometry: the rim is π·d and each slice
  // boundary removes a sliceGap channel. A necessary bound, not a guarantee;
  // it contributes nothing at the default sliceGap 0.
  const minLabelSubChartExtent = calculateMinLabelSubChartExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const minSlotDiameter = Math.max(
    minLabelSubChartExtent,
    mergedStyle.pie.sliceGap > 0
      ? maxSlicesPerPie(transformedData, mergedStyle) *
        mergedStyle.pie.sliceGap / Math.PI
      : 0,
  );
  const labelBudget = calculatePieLabelFloorBudget(
    rc,
    transformedData,
    mergedStyle,
    allPieIndices(transformedData),
  );

  // The floor pass runs before any sub-chart shape exists, so the slot
  // objective has nothing to optimise against and the slot grid is the plain
  // ceil(sqrt(n)). That overstates the demand for a wide, short
  // frame — conservative in the safe direction: an overstated floor only
  // makes autofit shrink type marginally earlier than it had to.
  const nIndicators = getDimensionMembers(transformedData.indicator).length;
  const nSlotCols = Math.ceil(Math.sqrt(nIndicators));
  const nSlotRows = Math.ceil(nIndicators / nSlotCols);
  const ind = mergedStyle.pie.indicators;
  const headerAllowance = showsIndicatorHeaders(transformedData, mergedStyle)
    ? ind.headerGap +
      rc.mText(
        SIZING_SAMPLE.paneHeader,
        mergedStyle.pie.text.indicatorHeaders,
        PANE_HEADER_SAMPLE_MAX_W,
      ).dims
        .h()
    : 0;

  // Categorical, not a scale legend: the swatches are the slices.
  const resolvedLegendLabels: LegendInput | undefined = resolveDefaultLegend(
    inputs.legend,
    transformedData.series,
  );

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: getDimensionMembers(transformedData.lane).length,
    nTiers: getDimensionMembers(transformedData.tier).length,
    nPanes: getDimensionMembers(transformedData.pane).length,
    minSubChartWidth: nSlotCols * (minSlotDiameter + labelBudget.horizontal) +
      (nSlotCols - 1) * ind.gapX,
    // The vertical demand COMBINES differently by placer: under
    // flank it is a stack the slot must be tall enough for; under nearest the
    // labels sit above and below the content, so it is additive.
    minSubChartHeight: nSlotRows *
        ((mergedStyle.pie.outsideLabelPlacement === "nearest"
          ? minSlotDiameter + labelBudget.vertical
          : Math.max(minSlotDiameter, labelBudget.vertical)) +
          headerAllowance) +
      (nSlotRows - 1) * ind.gapY,
    xAxisHeight: 0,
    paneHeaderHeight: rc
      .mText(
        SIZING_SAMPLE.paneHeader,
        mergedStyle.text.paneHeaders,
        PANE_HEADER_SAMPLE_MAX_W,
      )
      .dims.h(),
    minYAxisWidth: 0,
    // The 4th argument matters: without it the estimator synthesizes
    // { id: label, label } members, so a seriesColorFunc keyed on .id with
    // labelReplacements active would estimate the wrong width.
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      customFigureStyle,
      resolvedLegendLabels,
      transformedData.series,
    ),
    resolvedLegendLabels,
  };
}

// The ideal height is the real decomposition: derive the per-sub-chart width
// from the same terms calculateChartMinWidth uses, split it into indicator
// slots at the SELF-CONSISTENT wrap, give each slot's content the
// silhouette's own aspect at the capped natural diameter, add back the
// vertical label demand and header strip, then let the shared helper add tier
// gaps, pane gaps, tier padding, pane headers and a measured surrounds
// height. Applying the aspect to the whole slot would bake the flank gutters
// into the height and pad every labelled pie with dead vertical whitespace.
//
// The idealPieDiameter policy is a CAP on the width-driven term, never a
// replacement: an ideal that exceeds the slot is meaningless, but without the
// cap a lone pie's ideal diameter IS the available width, which is how a
// single pie on a 1000-DU frame used to ask to be 1087 DU tall.
//
// maxH is FINITE (= idealH), unlike map's Infinity. A finite maxH means "I
// resist stretching"; Infinity means "I fill freely, leave me uncapped". Every
// pixel of height past the silhouette aspect is whitespace, so uncapped is
// actively wrong in a column layout.
function getPieIdealHeight(
  rc: RenderContext,
  width: number,
  inputs: PieInputs,
): HeightConstraints {
  const info = getPieComponentSizes(rc, inputs, 1);
  const paneGrid = resolvePaneGrid(info, width);
  const { nCols: nPaneCols } = paneGrid;

  const laneGapsWidth = (info.nLanes - 1) * info.mergedStyle.lanes.gapX *
    nPaneCols;
  const paneGapsWidth = (nPaneCols - 1) * info.mergedStyle.panes.gapX;
  const lanePaddingWidth =
    (info.mergedStyle.lanes.paddingLeft + info.mergedStyle.lanes.paddingRight) *
    nPaneCols;
  const subChartWidth = (width -
    info.surroundsMinWidth -
    laneGapsWidth -
    paneGapsWidth -
    lanePaddingWidth) /
    (nPaneCols * info.nLanes);

  const transformedData = getPieDataTransformed(inputs.data);
  const mergedStyle = new CustomFigureStyle(
    inputs.style,
    1,
    inputs.autofitSurrounds,
  )
    .getMergedPieStyle();
  const contentFloor = calculateMinLabelSubChartExtent(
    rc,
    mergedStyle.text.dataLabels,
  );

  const ctx = buildSlotObjectiveContext(rc, transformedData, mergedStyle);
  const idealCols = resolveIdealSlotCols(ctx, subChartWidth, contentFloor);
  const subChartHeight = idealSubChartHeightAt(
    ctx,
    idealCols,
    subChartWidth,
    contentFloor,
  );

  const idealH = calculateChartIdealHeight(
    rc,
    width,
    { ...info, minSubChartHeight: subChartHeight },
    inputs,
    paneGrid,
  );

  const minComfortableWidth = calculateChartMinWidth(info);

  // minH is derived from the real floor at the autofit floor scale, exactly
  // as the value-axis charts derive theirs, never idealH × 0.5, which would
  // both hide a missing clamp (the layouter never allocates below it) and
  // overstate the true floor by ~4x. getPieComponentSizes'
  // minSubChartHeight IS the legibility floor, so the shared decomposition at
  // floorScale is the whole derivation. With autofit off, type cannot shrink,
  // and the natural height is the minimum — the value-axis convention.
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  let minH = idealH;
  if (autofitOpts) {
    const floorScale = computeFloorScale({
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: info.customFigureStyle.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    });
    const infoFloor = getPieComponentSizes(rc, inputs, floorScale);
    minH = calculateChartIdealHeight(
      rc,
      width,
      infoFloor,
      inputs,
      resolvePaneGrid(infoFloor, width),
    );
  }

  return {
    minH: Math.min(minH, idealH),
    idealH,
    maxH: idealH,
    neededScalingToFitWidth: width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth,
    minComfortableWidth,
  };
}
