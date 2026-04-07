// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
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
import type { MapInputs, MeasuredMap } from "./types.ts";
import { measureMap } from "./_internal/measure_map.ts";
import { renderMap } from "./_internal/render_map.ts";
import { getMapDataTransformed } from "./get_map_data.ts";
import { getProjectionFn } from "./_internal/projections.ts";
import { forEachCoordinate } from "./_internal/geo_helpers.ts";

export const MapRenderer: Renderer<MapInputs, MeasuredMap> = {
  isType(item: unknown): item is MapInputs {
    return typeof item === "object" && item !== null && "mapData" in item;
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MapInputs,
    responsiveScale?: number,
  ): MeasuredMap {
    return measureChartWithAutofit(
      rc,
      bounds,
      item,
      (scale) => getMapComponentSizes(rc, item, scale),
      measureMap,
      responsiveScale,
    );
  },

  render(rc: RenderContext, measured: MeasuredMap): void {
    renderMap(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: MapInputs,
    responsiveScale?: number,
  ): void {
    const measured = this.measure(rc, bounds, item, responsiveScale);
    this.render(rc, measured);
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    item: MapInputs,
    _responsiveScale?: number,
  ): HeightConstraints {
    return getMapIdealHeight(rc, width, item);
  },
};

function getMapComponentSizes(
  rc: RenderContext,
  item: MapInputs,
  scale: number,
): ChartComponentSizes {
  const customFigureStyle = new CustomFigureStyle(item.style, scale);
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const transformedData = getMapDataTransformed(item.mapData);
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
    minSubChartWidth: 50,
    minSubChartHeight: 50,
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

function getMapIdealHeight(
  _rc: RenderContext,
  width: number,
  item: MapInputs,
): HeightConstraints {
  const transformedData = getMapDataTransformed(item.mapData);
  const customFigureStyle = new CustomFigureStyle(item.style);
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of transformedData.geoFeatures) {
    forEachCoordinate(feature.geometry, (lon, lat) => {
      const [x, y] = projectionFn(lon, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  }

  const projW = maxX - minX;
  const projH = maxY - minY;
  const aspectRatio = projW > 0 && projH > 0 ? projW / projH : 1;
  const idealH = width / aspectRatio;

  return {
    minH: idealH * 0.5,
    idealH,
    maxH: Infinity,
    neededScalingToFitWidth: 1,
  };
}
