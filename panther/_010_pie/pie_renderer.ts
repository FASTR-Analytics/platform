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
  CustomFigureStyle,
  estimateMinSurroundsWidth,
  type HeightConstraints,
  type LegendInput,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveDefaultLegend,
} from "./deps.ts";
import type { MeasuredPie, PieDataTransformed, PieInputs } from "./types.ts";
import { getPieDataTransformed } from "./get_pie_data.ts";
import { calculatePieLabelFloorBudget } from "./_internal/generate_pie_label_candidates.ts";
import type { CellIndices } from "./_internal/generate_pie_slice_primitives.ts";
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
  // the style scale. The content disc is aspect-1, but the CELL floors are no
  // longer equal (plan D4): outside labels add width (the flank gutters) and
  // can add height (a flank stack taller than the disc). Both label terms are
  // unwrapped, so each floor stays proportional to the scale (monotone) and
  // free of any cell dependence.
  const minLabelPlotExtent = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const labelBudget = calculatePieLabelFloorBudget(
    rc,
    transformedData,
    mergedStyle,
    allCellIndices(transformedData),
  );

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
    minSubChartWidth: minLabelPlotExtent + labelBudget.horizontal,
    minSubChartHeight: Math.max(minLabelPlotExtent, labelBudget.tallestStack),
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

function allCellIndices(data: PieDataTransformed): CellIndices[] {
  const indices: CellIndices[] = [];
  for (let paneIndex = 0; paneIndex < data.paneHeaders.length; paneIndex++) {
    for (let tierIndex = 0; tierIndex < data.tierHeaders.length; tierIndex++) {
      for (
        let laneIndex = 0;
        laneIndex < data.laneHeaders.length;
        laneIndex++
      ) {
        indices.push({ paneIndex, tierIndex, laneIndex });
      }
    }
  }
  return indices;
}

// The content DISC is square, so the ideal height is the real decomposition:
// derive the per-cell width from the same terms calculateChartMinWidth uses,
// subtract the horizontal label budget to get the disc, make THAT square, add
// back the vertical label demand, then let the shared helper add tier gaps,
// pane gaps, tier padding, pane headers and a measured surrounds height.
// Squaring the whole cell would bake the flank gutters into the height and
// pad every labelled pie with dead vertical whitespace (plan D4).
//
// maxH is FINITE (= idealH), unlike map's Infinity. A finite maxH means "I
// resist stretching"; Infinity means "I fill freely, leave me uncapped". Since
// radius is min(w, h) / 2, every pixel of height past square is whitespace, so
// uncapped is actively wrong in a column layout.
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
  const labelBudget = calculatePieLabelFloorBudget(
    rc,
    transformedData,
    mergedStyle,
    allCellIndices(transformedData),
  );
  const contentFloor = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );

  // The disc gets what is left of the cell after the flank gutters, is never
  // squeezed below the legibility floor (calculateChartIdealHeight multiplies
  // minSubChartHeight through WITHOUT clamping), and the cell must also hold
  // the tallest label stack.
  const contentD = Math.max(cellW - labelBudget.horizontal, contentFloor);
  const cellH = Math.max(contentD, labelBudget.tallestStack);

  const idealH = calculateChartIdealHeight(
    rc,
    width,
    { ...info, minSubChartHeight: cellH },
    item,
  );

  const minComfortableWidth = calculateChartMinWidth(info);

  return {
    minH: idealH * 0.5,
    idealH,
    maxH: idealH,
    neededScalingToFitWidth: width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth,
    minComfortableWidth,
  };
}
