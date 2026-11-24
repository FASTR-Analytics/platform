// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinLabelSubChartExtent,
  type ChartComponentSizes,
  type ChartProbeSizing,
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartSizeConstraintsByMeasure,
  getDimensionMembers,
  type LegendInput,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveDefaultLegend,
  type SizeConstraints,
  SIZING_SAMPLE,
} from "./deps.ts";
import type { MeasuredPie, PieDataTransformed, PieInputs } from "./types.ts";
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
    const data = getPieDataTransformed(inputs.data);
    return measureChartWithAutofit(
      rc,
      bounds,
      inputs,
      (scale) => getPieComponentSizes(rc, inputs, data, scale),
      (rc2, b, inp, paneGrid, fitScale) =>
        measurePie(rc2, b, inp, data, paneGrid, fitScale),
      buildPieProbeSizing(rc, bounds.w(), inputs, data),
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

  // maxH is FINITE (= idealH), unlike map's Infinity. A finite maxH means "I
  // resist stretching"; Infinity means "I fill freely, leave me uncapped".
  // Every pixel of height past the silhouette aspect is whitespace, so
  // uncapped is actively wrong in a column layout.
  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: PieInputs,
  ): SizeConstraints {
    const data = getPieDataTransformed(inputs.data);
    return getChartSizeConstraintsByMeasure(
      rc,
      width,
      inputs,
      (scale) => getPieComponentSizes(rc, inputs, data, scale),
      buildPieProbeSizing(rc, width, inputs, data),
    );
  },
};

export function getPieComponentSizes(
  rc: RenderContext,
  inputs: PieInputs,
  data: PieDataTransformed,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedPieStyle();

  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. The floors are not equal per direction:
  // outside labels add width (the flank gutters) and can add height (a flank
  // stack taller than the content), and the largest inside label box is a
  // floor of its own, since inside labels are confined to the slot. Every
  // label term is unwrapped, so each floor stays proportional to the scale
  // (monotone) and free of any slot dependence.
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
      ? maxSlicesPerPie(data, mergedStyle) *
        mergedStyle.pie.sliceGap / Math.PI
      : 0,
  );
  const labelBudget = calculatePieLabelFloorBudget(
    rc,
    data,
    mergedStyle,
    allPieIndices(data),
  );

  // An explicit nCols is the slot grid measurePie draws. Under "auto" the
  // floor pass runs before any sub-chart shape exists, so the slot
  // objective has nothing to optimise against and the slot grid is the plain
  // ceil(sqrt(n)). That overstates the demand for a wide, short
  // frame — conservative in the safe direction: an overstated floor only
  // makes autofit shrink type marginally earlier than it had to.
  const nIndicators = getDimensionMembers(data.indicator).length;
  const ind = mergedStyle.pie.indicators;
  const nSlotCols = ind.nCols !== "auto"
    ? ind.nCols
    : Math.ceil(Math.sqrt(nIndicators));
  const nSlotRows = Math.ceil(nIndicators / nSlotCols);
  const headerAllowance = showsIndicatorHeaders(data, mergedStyle)
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
    data.series,
  );

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: getDimensionMembers(data.lane).length,
    nTiers: getDimensionMembers(data.tier).length,
    nPanes: getDimensionMembers(data.pane).length,
    minSubChartWidth: nSlotCols *
        Math.max(
          minSlotDiameter + labelBudget.horizontal,
          labelBudget.insideBoxWidth,
        ) +
      (nSlotCols - 1) * ind.gapX,
    // The vertical demand COMBINES differently by placer: under
    // flank it is a stack the slot must be tall enough for; under nearest the
    // labels sit above and below the content, so it is additive.
    minSubChartHeight: nSlotRows *
        (Math.max(
          mergedStyle.pie.outsideLabelPlacement === "nearest"
            ? minSlotDiameter + labelBudget.vertical
            : Math.max(minSlotDiameter, labelBudget.vertical),
          labelBudget.insideBoxHeight,
        ) +
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
    minYAxisWidth: estimateTierHeaderAndLabelGapWidth(
      rc,
      data.tier,
      data.lane,
      mergedStyle,
    ),
    // The 4th argument matters: without it the estimator synthesizes
    // { id: label, label } members, so a seriesColorFunc keyed on .id with
    // labelReplacements active would estimate the wrong width.
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      customFigureStyle,
      resolvedLegendLabels,
      data.series,
    ),
    resolvedLegendLabels,
  };
}

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so the slot grid and the per-pie solve are skipped.
//
// The natural sub-chart height: the probe's sub-chart width split into
// indicator slots at the SELF-CONSISTENT wrap, each slot's content given the
// silhouette's own aspect at the capped natural diameter, with the vertical
// label demand and the header strip added back. Applying the aspect to the
// whole slot would bake the flank gutters into the height and pad every
// labelled pie with dead vertical whitespace.
//
// The idealPieDiameter policy is a CAP on the width-driven term, never a
// replacement: an ideal that exceeds the slot is meaningless, but without the
// cap a lone pie's ideal diameter IS the available width, which is how a
// single pie on a 1000-DU frame used to ask to be 1087 DU tall.
function buildPieProbeSizing(
  rc: RenderContext,
  width: number,
  inputs: PieInputs,
  data: PieDataTransformed,
): ChartProbeSizing {
  return {
    probeMeasure: (probeH, paneGrid, scale) =>
      measurePie(
        rc,
        new RectCoordsDims([0, 0, width, probeH]),
        inputs,
        data,
        paneGrid,
        scale,
        true,
      ).paneLayouts,
    resolveTarget: (info, probeLayouts) => {
      const mergedStyle = info.customFigureStyle.getMergedPieStyle();
      const subChartWidth = Math.min(
        ...probeLayouts.map((l) => l.uniformSubChartWidth),
      );
      const contentFloor = calculateMinLabelSubChartExtent(
        rc,
        mergedStyle.text.dataLabels,
      );
      const ctx = buildSlotObjectiveContext(rc, data, mergedStyle);
      return idealSubChartHeightAt(
        ctx,
        resolveIdealSlotCols(ctx, subChartWidth, contentFloor),
        subChartWidth,
        contentFloor,
      );
    },
  };
}
