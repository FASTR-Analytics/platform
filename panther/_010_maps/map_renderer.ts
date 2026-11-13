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
  getSubChartMembers,
  type HeightConstraints,
  isAutoScaleLegendConfig,
  type LegendInput,
  measureChartWithAutofit,
  type RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveAutoScaleLegend,
  resolveFigureAutofitOptions,
  resolvePaneGrid,
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
import { resolveShownMapAreas } from "./_internal/generate_map_area_primitives.ts";
import { getFeatureMatchKey } from "./_internal/label_shared.ts";

export const MapRenderer: Renderer<MapInputs, MeasuredMap> = {
  isType(inputs: unknown): inputs is MapInputs {
    return typeof inputs === "object" && inputs !== null &&
      "figureType" in inputs && inputs.figureType === "map";
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: MapInputs,
  ): MeasuredMap {
    return measureChartWithAutofit(
      rc,
      bounds,
      inputs,
      (scale) => getMapComponentSizes(rc, inputs, scale),
      measureMap,
    );
  },

  render(rc: RenderContext, measured: MeasuredMap): void {
    renderMap(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: MapInputs,
  ): void {
    const measured = this.measure(rc, bounds, inputs);
    this.render(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: MapInputs,
  ): HeightConstraints {
    return getMapIdealHeight(rc, width, inputs);
  },
};

export function getMapComponentSizes(
  rc: RenderContext,
  inputs: MapInputs,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const transformedData = getMapDataTransformed(inputs.data);
  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. Outside labels add width (the flank gutters) and can add
  // height (a flank stack taller than the map) — both label terms are
  // unwrapped, so each floor stays proportional to the scale (monotone) and
  // free of any cell dependence.
  const minLabelSubChartExtent = calculateMinLabelSubChartExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const labelBudget = calculateMapFloorBudget(rc, transformedData, mergedStyle);
  const resolvedLegendLabels: LegendInput | undefined =
    isAutoScaleLegendConfig(inputs.legend)
      ? resolveAutoScaleLegend(
        inputs.legend,
        customFigureStyle.getValuesColorFunc(),
        transformedData.valueRange,
      )
      : inputs.legend;

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: getDimensionMembers(transformedData.lane).length,
    nTiers: getDimensionMembers(transformedData.tier).length,
    nPanes: getDimensionMembers(transformedData.pane).length,
    minSubChartWidth: minLabelSubChartExtent + labelBudget.horizontal,
    // The vertical demand COMBINES differently by placer: under
    // flank it is a stack the cell must be tall enough for; under nearest the
    // labels sit above and below the content, so it is additive.
    minSubChartHeight: mergedStyle.map.outsideLabelPlacement === "nearest"
      ? minLabelSubChartExtent + labelBudget.vertical
      : Math.max(minLabelSubChartExtent, labelBudget.vertical),
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
  const nPanes = getDimensionMembers(data.pane).length;
  const nTiers = getDimensionMembers(data.tier).length;
  const nLanes = getDimensionMembers(data.lane).length;
  for (let i_pane = 0; i_pane < nPanes; i_pane++) {
    for (let i_tier = 0; i_tier < nTiers; i_tier++) {
      for (let i_lane = 0; i_lane < nLanes; i_lane++) {
        const valueMap = data.valueMaps[i_pane][i_tier][i_lane];
        const members = getSubChartMembers(data, {
          i_pane,
          i_tier,
          i_lane,
        });
        const fitting = featuresForFit(
          data.geoFeatures,
          valueMap,
          data.mapArea.matchProp,
          mergedStyle.map.fit,
        );
        cells.push({
          shown: resolveShownMapAreas(
            data.geoFeatures,
            valueMap,
            data.valueRange,
            data,
            mergedStyle.content.mapAreas.getStyle,
            i_pane,
            i_tier,
            i_lane,
            members,
          ),
          indices: { i_pane, i_tier, i_lane },
          members,
          unitFitted: fitProjectionAtScale(fitting, projectionFn, 1, 0, 0),
        });
      }
    }
  }
  return calculateMapLabelFloorBudget(rc, cells, mergedStyle);
}

// The content ASPECT is the projection's, so the ideal height derives the
// per-sub-chart width from the same terms calculateChartMinWidth uses, subtracts
// the horizontal label budget, applies the aspect to what remains, adds the
// vertical label demand back, and lets the shared helper add gaps, padding
// and a measured surrounds height. maxH stays Infinity — a map fills freely.
function getMapIdealHeight(
  rc: RenderContext,
  width: number,
  inputs: MapInputs,
): HeightConstraints {
  const info = getMapComponentSizes(rc, inputs, 1);
  const transformedData = getMapDataTransformed(inputs.data);
  const mergedStyle = new CustomFigureStyle(inputs.style).getMergedMapStyle();
  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  // Aspect from the union of every cell's fitting features, so
  // "only-map-areas-in-data" shapes the ideal height the way it shapes cells.
  const fittingUnion = mergedStyle.map.fit === "only-map-areas-in-data"
    ? transformedData.geoFeatures.filter((f) => {
      const key = getFeatureMatchKey(f, transformedData.mapArea.matchProp);
      return transformedData.valueMaps.some((pane) =>
        pane.some((tier) => tier.some((valueMap) => key in valueMap))
      );
    })
    : transformedData.geoFeatures;
  const projBounds = computeProjectedBounds(fittingUnion, projectionFn);
  const aspectRatio = projBounds && projBounds.w > 0 && projBounds.h > 0
    ? projBounds.w / projBounds.h
    : 1;

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

  const labelBudget = calculateMapFloorBudget(rc, transformedData, mergedStyle);
  const contentFloor = calculateMinLabelSubChartExtent(
    rc,
    mergedStyle.text.dataLabels,
  );

  // The content gets what is left of the cell after the label gutters and is
  // never squeezed below the legibility floor. The height then combines by
  // placer, exactly as minSubChartHeight does above.
  const contentW = Math.max(
    subChartWidth - labelBudget.horizontal,
    contentFloor,
  );
  const contentH = contentW / aspectRatio;
  const subChartHeight = mergedStyle.map.outsideLabelPlacement === "nearest"
    ? Math.max(contentH, contentFloor) + labelBudget.vertical
    : Math.max(contentH, labelBudget.vertical, contentFloor);

  const idealH = calculateChartIdealHeight(
    rc,
    width,
    { ...info, minSubChartHeight: subChartHeight },
    inputs,
    paneGrid,
  );

  const minComfortableWidth = calculateChartMinWidth(info);

  // minH is derived from the real floor at the autofit floor scale, exactly
  // as the value-axis charts derive theirs, never idealH × 0.5.
  // getMapComponentSizes' minSubChartHeight IS the legibility floor, so
  // the shared decomposition at floorScale is the whole derivation. With
  // autofit off, type cannot shrink and the natural height is the minimum —
  // the value-axis convention.
  const autofitOpts = resolveFigureAutofitOptions(inputs.autofit);
  let minH = idealH;
  if (autofitOpts) {
    const floorScale = computeFloorScale({
      minScale: autofitOpts.minScale,
      maxScale: autofitOpts.maxScale,
      baseFontSizeDu: info.customFigureStyle.baseFontSize,
      minFontSizeDu: autofitOpts.minFontSizeDu,
    });
    const infoFloor = getMapComponentSizes(rc, inputs, floorScale);
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
    maxH: Infinity,
    neededScalingToFitWidth: width >= minComfortableWidth
      ? 1
      : width / minComfortableWidth,
    minComfortableWidth,
  };
}
