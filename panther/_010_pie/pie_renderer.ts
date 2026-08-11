// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelPlotExtent,
  calculatePaneGrid,
  type ChartComponentSizes,
  computeFloorScale,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  type HeightConstraints,
  type LegendInput,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveDefaultLegend,
  resolveFigureAutofitOptions,
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
  isType(item: unknown): item is PieInputs {
    return typeof item === "object" && item !== null &&
      "figureType" in item && item.figureType === "pie";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PieInputs,
  ): MeasuredPie {
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getPieComponentSizes(rc, item, scale),
      measurePie,
    );
  },

  render(rc: RenderContext, measured: MeasuredPie): void {
    renderPie(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PieInputs,
  ): void {
    this.render(rc, this.measure(rc, bounds, item));
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: PieInputs,
  ): HeightConstraints {
    return getPieIdealHeight(rc, width, item);
  },
};

export function getPieComponentSizes(
  rc: RenderContext,
  item: PieInputs,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    item.style,
    scale,
    item.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedPieStyle();
  const transformedData = getPieDataTransformed(item.data);

  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. The floors are not equal per direction (plan D4):
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
  // The gap term is geometry (plan D7): the rim is π·d and each slice
  // boundary removes a sliceGap channel. A necessary bound, not a guarantee;
  // it contributes nothing at the default sliceGap 0.
  const minLabelPlotExtent = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const minSlotDiameter = Math.max(
    minLabelPlotExtent,
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

  // The floor pass runs before any sub-chart shape exists, so D9's objective
  // has nothing to optimise against and the slot grid is the plain
  // ceil(sqrt(n)) (plan D3). That overstates the demand for a wide, short
  // frame — conservative in the safe direction: an overstated floor only
  // makes autofit shrink type marginally earlier than it had to.
  const nIndicators = transformedData.indicatorHeaders.length;
  const nSlotCols = Math.ceil(Math.sqrt(nIndicators));
  const nSlotRows = Math.ceil(nIndicators / nSlotCols);
  const ind = mergedStyle.pie.indicators;
  const headerAllowance = showsIndicatorHeaders(transformedData, mergedStyle)
    ? ind.headerGap +
      rc.mText("Region 001", mergedStyle.pie.text.indicatorHeaders, 400).dims
        .h()
    : 0;

  // Categorical, not a scale legend: the swatches are the slices.
  const resolvedLegendLabels: LegendInput | undefined = resolveDefaultLegend(
    item.legend,
    transformedData.seriesHeaders,
  );

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: transformedData.laneHeaders.length,
    nTiers: transformedData.tierHeaders.length,
    paneHeaders: transformedData.paneHeaders,
    minSubChartWidth: nSlotCols * (minSlotDiameter + labelBudget.horizontal) +
      (nSlotCols - 1) * ind.gapX,
    // The vertical demand COMBINES differently by placer (plan N9): under
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
      .mText("Region 001", mergedStyle.text.paneHeaders, 400)
      .dims.h(),
    minYAxisWidth: 0,
    // The 4th argument matters: without it the estimator synthesizes
    // { id: label, label } headers, so a seriesColorFunc keyed on .id with
    // labelReplacements active would estimate the wrong width.
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      customFigureStyle,
      resolvedLegendLabels,
      transformedData.seriesHeaders,
    ),
    resolvedLegendLabels,
  };
}

// The ideal height is the real decomposition: derive the per-sub-chart width
// from the same terms calculateChartMinWidth uses, split it into indicator
// slots at the SELF-CONSISTENT wrap (plan D8), give each slot's content the
// silhouette's own aspect at the capped natural diameter, add back the
// vertical label demand and header strip, then let the shared helper add tier
// gaps, pane gaps, tier padding, pane headers and a measured surrounds
// height. Applying the aspect to the whole slot would bake the flank gutters
// into the height and pad every labelled pie with dead vertical whitespace
// (plan D4).
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
  item: PieInputs,
): HeightConstraints {
  const info = getPieComponentSizes(rc, item, 1);
  const { nGCols } = calculatePaneGrid(
    info.paneHeaders.length,
    info.mergedStyle.panes.nCols,
  );

  const laneGapsWidth = (info.nLanes - 1) * info.mergedStyle.lanes.gapX *
    nGCols;
  const paneGapsWidth = (nGCols - 1) * info.mergedStyle.panes.gapX;
  const lanePaddingWidth =
    (info.mergedStyle.lanes.paddingLeft + info.mergedStyle.lanes.paddingRight) *
    nGCols;
  const cellW = (width -
    info.surroundsMinWidth -
    laneGapsWidth -
    paneGapsWidth -
    lanePaddingWidth) /
    (nGCols * info.nLanes);

  const transformedData = getPieDataTransformed(item.data);
  const mergedStyle = new CustomFigureStyle(
    item.style,
    1,
    item.autofitSurrounds,
  )
    .getMergedPieStyle();
  const contentFloor = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );

  const ctx = buildSlotObjectiveContext(rc, transformedData, mergedStyle);
  const idealCols = resolveIdealSlotCols(ctx, cellW, contentFloor);
  const cellH = idealSubChartHeightAt(ctx, idealCols, cellW, contentFloor);

  const idealH = calculateChartIdealHeight(
    rc,
    width,
    { ...info, minSubChartHeight: cellH },
    item,
  );

  const minComfortableWidth = calculateChartMinWidth(info);

  // minH is derived from the real floor at the autofit floor scale (plan
  // D10), exactly as the scale-axis charts derive theirs — never idealH ×
  // 0.5, which both hid the missing clamp (the layouter never allocated below
  // it) and overstated the true floor by ~4x. getPieComponentSizes'
  // minSubChartHeight IS the D7 floor, so the shared decomposition at
  // floorScale is the whole derivation. With autofit off, type cannot shrink,
  // and the natural height is the minimum — the scale-axis convention.
  const autofitOpts = resolveFigureAutofitOptions(item.autofit);
  let minH = idealH;
  if (autofitOpts) {
    const floorScale = computeFloorScale({
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: info.customFigureStyle.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    });
    const infoFloor = getPieComponentSizes(rc, item, floorScale);
    minH = calculateChartIdealHeight(rc, width, infoFloor, item);
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
