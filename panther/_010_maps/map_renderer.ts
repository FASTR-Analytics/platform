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
  getSubChartMembers,
  isAutoScaleLegendConfig,
  type LegendInput,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  resolveAutoScaleLegend,
  type SizeConstraints,
  SIZING_SAMPLE,
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
    const data = getMapDataTransformed(inputs.data);
    return measureChartWithAutofit(
      rc,
      bounds,
      inputs,
      (scale) => getMapComponentSizes(rc, inputs, data, scale),
      (rc2, b, inp, paneGrid, fitScale) =>
        measureMap(rc2, b, inp, data, paneGrid, fitScale),
      buildMapProbeSizing(rc, bounds.w(), inputs, data),
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

  // maxH is Infinity, never idealH: a map fills freely.
  getIdealHeight(
    rc: RenderContext,
    width: number,
    inputs: MapInputs,
  ): SizeConstraints {
    const data = getMapDataTransformed(inputs.data);
    return {
      ...getChartSizeConstraintsByMeasure(
        rc,
        width,
        inputs,
        (scale) => getMapComponentSizes(rc, inputs, data, scale),
        buildMapProbeSizing(rc, width, inputs, data),
      ),
      maxH: Infinity,
    };
  },
};

export function getMapComponentSizes(
  rc: RenderContext,
  inputs: MapInputs,
  data: MapDataTransformed,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    scale,
    inputs.autofitSurrounds,
  );
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  // Measured from the (scaled) data-label style, so the floor shrinks with
  // the style scale. Outside labels add width (the flank gutters) and can add
  // height (a flank stack taller than the map) — both label terms are
  // unwrapped, so each floor stays proportional to the scale (monotone) and
  // free of any sub-chart dependence.
  const minLabelSubChartExtent = calculateMinLabelSubChartExtent(
    rc,
    mergedStyle.text.dataLabels,
  );
  const labelBudget = calculateMapFloorBudget(rc, data, mergedStyle);
  const resolvedLegendLabels: LegendInput | undefined =
    isAutoScaleLegendConfig(inputs.legend)
      ? resolveAutoScaleLegend(
        inputs.legend,
        customFigureStyle.getValuesColorFunc(),
        data.valueRange,
      )
      : inputs.legend;

  return {
    customFigureStyle,
    mergedStyle,
    nLanes: getDimensionMembers(data.lane).length,
    nTiers: getDimensionMembers(data.tier).length,
    nPanes: getDimensionMembers(data.pane).length,
    minSubChartWidth: Math.max(
      minLabelSubChartExtent + labelBudget.horizontal,
      labelBudget.insideBoxWidth,
    ),
    minSubChartHeight: Math.max(
      mergedStyle.map.outsideLabelPlacement === "nearest"
        ? minLabelSubChartExtent + labelBudget.vertical
        : Math.max(minLabelSubChartExtent, labelBudget.vertical),
      labelBudget.insideBoxHeight,
    ),
    xAxesHeight: 0,
    paneHeaderHeight: rc
      .mText(
        SIZING_SAMPLE.paneHeader,
        mergedStyle.text.paneHeaders,
        PANE_HEADER_SAMPLE_MAX_W,
      )
      .dims.h(),
    minYAxesWidth: estimateTierHeaderAndLabelGapWidth(
      rc,
      data.tier,
      data.lane,
      mergedStyle,
    ),
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
  const shownPerSubChart: Parameters<typeof calculateMapLabelFloorBudget>[1] =
    [];
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
        shownPerSubChart.push({
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
  return calculateMapLabelFloorBudget(rc, shownPerSubChart, mergedStyle);
}

// Probes run layout-only: they consume the returned geometry, never the
// primitives, so the per-sub-chart solve is skipped. The natural sub-chart
// height is what is left of the probe's sub-chart width after the label
// gutters, never below the legibility floor, shaped by the projection's
// aspect, with the vertical label demand combined by placer as
// minSubChartHeight combines it.
function buildMapProbeSizing(
  rc: RenderContext,
  width: number,
  inputs: MapInputs,
  data: MapDataTransformed,
): ChartProbeSizing {
  return {
    probeMeasure: (probeH, paneGrid, scale) =>
      measureMap(
        rc,
        new RectCoordsDims([0, 0, width, probeH]),
        inputs,
        data,
        paneGrid,
        scale,
        true,
      ).paneLayouts,
    resolveTarget: (info, probeLayouts) => {
      const mergedStyle = info.customFigureStyle.getMergedMapStyle();
      const subChartWidth = Math.min(
        ...probeLayouts.map((l) => l.uniformSubChartWidth),
      );
      const labelBudget = calculateMapFloorBudget(rc, data, mergedStyle);
      const contentFloor = calculateMinLabelSubChartExtent(
        rc,
        mergedStyle.text.dataLabels,
      );
      const contentW = Math.max(
        subChartWidth - labelBudget.horizontal,
        contentFloor,
      );
      const contentH = contentW / mapAspectRatio(data, mergedStyle);
      return mergedStyle.map.outsideLabelPlacement === "nearest"
        ? Math.max(contentH, contentFloor) + labelBudget.vertical
        : Math.max(contentH, labelBudget.vertical, contentFloor);
    },
  };
}

// From the union of every map's fitting features, so
// "only-map-areas-in-data" shapes the ideal height the way it shapes each
// map.
function mapAspectRatio(
  data: MapDataTransformed,
  mergedStyle: MergedMapStyle,
): number {
  const fittingUnion = mergedStyle.map.fit === "only-map-areas-in-data"
    ? data.geoFeatures.filter((f) => {
      const key = getFeatureMatchKey(f, data.mapArea.matchProp);
      return data.valueMaps.some((pane) =>
        pane.some((tier) => tier.some((valueMap) => key in valueMap))
      );
    })
    : data.geoFeatures;
  const projBounds = computeProjectedBounds(
    fittingUnion,
    getProjectionFn(mergedStyle.map.projection),
  );
  return projBounds && projBounds.w > 0 && projBounds.h > 0
    ? projBounds.w / projBounds.h
    : 1;
}
