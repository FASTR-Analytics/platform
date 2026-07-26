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
  isAutoScaleLegendConfig,
  type LegendInput,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveAutoScaleLegend,
} from "./deps.ts";
import type { MapDataTransformed, MapInputs, MeasuredMap } from "./types.ts";
import type { MergedMapStyle } from "./deps.ts";
import { featuresForFit, measureMap } from "./_internal/measure_map.ts";
import { renderMap } from "./_internal/render_map.ts";
import { getMapDataTransformed } from "./get_map_data.ts";
import { getProjectionFn } from "./_internal/projections.ts";
import {
  computeProjectedBounds,
  fitProjectionAtScale,
} from "./_internal/fit_projection.ts";
import {
  calculateMapLabelFloorBudget,
  type MapLabelFloorBudget,
} from "./_internal/generate_map_label_primitives.ts";
import { resolveShownRegions } from "./_internal/generate_map_region_primitives.ts";
import { getFeatureMatchKey } from "./_internal/label_shared.ts";

export const MapRenderer: Renderer<MapInputs, MeasuredMap> = {
  isType(item: unknown): item is MapInputs {
    return typeof item === "object" && item !== null &&
      "figureType" in item && item.figureType === "map";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MapInputs,
  ): MeasuredMap {
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getMapComponentSizes(rc, item, scale),
      measureMap,
    );
  },

  render(rc: RenderContext, measured: MeasuredMap): void {
    renderMap(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MapInputs,
  ): void {
    const measured = this.measure(rc, bounds, item);
    this.render(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MapInputs,
  ): HeightConstraints {
    return getMapIdealHeight(rc, width, item);
  },
};

export function getMapComponentSizes(
  rc: RenderContext,
  item: MapInputs,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    item.style,
    scale,
    item.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const transformedData = getMapDataTransformed(item.data);
  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. Outside labels add width (the flank gutters) and can add
  // height (a flank stack taller than the map) — both label terms are
  // unwrapped, so each floor stays proportional to the scale (monotone) and
  // free of any cell dependence (plan D4).
  const minLabelPlotExtent = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const labelBudget = calculateMapFloorBudget(rc, transformedData, mergedStyle);
  const resolvedLegendLabels: LegendInput | undefined =
    isAutoScaleLegendConfig(item.legend)
      ? resolveAutoScaleLegend(
        item.legend,
        customFigureStyle.getValuesColorFunc(),
        transformedData.valueRange,
      )
      : item.legend;

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: transformedData.laneHeaders.length,
    nTiers: transformedData.tierHeaders.length,
    paneHeaders: transformedData.paneHeaders,
    minSubChartWidth: minLabelPlotExtent + labelBudget.horizontal,
    minSubChartHeight: Math.max(minLabelPlotExtent, labelBudget.tallestStack),
    xAxisHeight: 0,
    paneHeaderHeight: 0,
    minYAxisWidth: 0,
    surroundsMinWidth: estimateMinSurroundsWidth(
      rc,
      customFigureStyle,
      resolvedLegendLabels,
    ),
    resolvedLegendLabels,
  };
}

function calculateMapFloorBudget(
  rc: RenderContext,
  data: MapDataTransformed,
  mergedStyle: MergedMapStyle,
): MapLabelFloorBudget {
  const projectionFn = getProjectionFn(mergedStyle.map.projection);
  const cells: Parameters<typeof calculateMapLabelFloorBudget>[1] = [];
  for (let paneIndex = 0; paneIndex < data.paneHeaders.length; paneIndex++) {
    for (let tierIndex = 0; tierIndex < data.tierHeaders.length; tierIndex++) {
      for (
        let laneIndex = 0;
        laneIndex < data.laneHeaders.length;
        laneIndex++
      ) {
        const valueMap = data.valueMaps[paneIndex][tierIndex][laneIndex];
        const fitting = featuresForFit(
          data.geoFeatures,
          valueMap,
          data.areaMatchProp,
          mergedStyle.map.fit,
        );
        cells.push({
          shown: resolveShownRegions(
            data.geoFeatures,
            valueMap,
            data.valueRange,
            data.areaMatchProp,
            mergedStyle.content.mapRegions.getStyle,
            paneIndex,
            tierIndex,
            laneIndex,
          ),
          indices: { paneIndex, tierIndex, laneIndex },
          unitFitted: fitProjectionAtScale(fitting, projectionFn, 1, 0, 0),
        });
      }
    }
  }
  return calculateMapLabelFloorBudget(rc, cells, mergedStyle);
}

// The content ASPECT is the projection's, so the ideal height derives the
// per-cell width from the same terms calculateChartMinWidth uses, subtracts
// the horizontal label budget, applies the aspect to what remains, adds the
// vertical label demand back, and lets the shared helper add gaps, padding
// and a measured surrounds height. maxH stays Infinity — a map fills freely.
function getMapIdealHeight(
  rc: RenderContext,
  width: number,
  item: MapInputs,
): HeightConstraints {
  const info = getMapComponentSizes(rc, item, 1);
  const transformedData = getMapDataTransformed(item.data);
  const mergedStyle = new CustomFigureStyle(item.style).getMergedMapStyle();
  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  // Aspect from the union of every cell's fitting features, so
  // "only-regions-in-data" shapes the ideal height the way it shapes cells.
  const fittingUnion = mergedStyle.map.fit === "only-regions-in-data"
    ? transformedData.geoFeatures.filter((f) => {
      const key = getFeatureMatchKey(f, transformedData.areaMatchProp);
      return transformedData.valueMaps.some((pane) =>
        pane.some((tier) => tier.some((valueMap) => key in valueMap))
      );
    })
    : transformedData.geoFeatures;
  const projBounds = computeProjectedBounds(fittingUnion, projectionFn);
  const aspectRatio = projBounds && projBounds.w > 0 && projBounds.h > 0
    ? projBounds.w / projBounds.h
    : 1;

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

  const labelBudget = calculateMapFloorBudget(rc, transformedData, mergedStyle);
  const contentFloor = calculateMinLabelPlotExtent(
    rc,
    mergedStyle.text.dataLabels,
  );

  // The content gets what is left of the cell after the flank gutters, is
  // never squeezed below the legibility floor, and the cell must also hold
  // the tallest label stack.
  const contentW = Math.max(cellW - labelBudget.horizontal, contentFloor);
  const contentH = contentW / aspectRatio;
  const cellH = Math.max(contentH, labelBudget.tallestStack, contentFloor);

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
    maxH: Infinity,
    neededScalingToFitWidth: width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth,
    minComfortableWidth,
  };
}
