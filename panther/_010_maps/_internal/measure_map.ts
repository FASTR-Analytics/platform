// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  measureChart,
  type MergedMapStyle,
  type Primitive,
  type RectCoordsDims,
  type RenderContext,
  type SimplifiedChartConfig,
} from "../deps.ts";
import { getMapDataTransformed } from "../get_map_data.ts";
import type { MapDataTransformed, MapInputs, MeasuredMap } from "../types.ts";
import { generateMapRegionPrimitives } from "./generate_map_region_primitives.ts";
import { generateMapLabelPrimitives } from "./generate_map_label_primitives.ts";

export function measureMap(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: MapInputs,
  responsiveScale?: number,
): MeasuredMap {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale,
  );
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const transformedData = getMapDataTransformed(inputs.mapData);

  const config: SimplifiedChartConfig<
    MapInputs,
    MapDataTransformed,
    MergedMapStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps: {
      paneHeaders: transformedData.paneHeaders,
      tierHeaders: transformedData.tierHeaders,
      laneHeaders: transformedData.laneHeaders,
      seriesHeaders: [],
    },
    xAxisConfig: { type: "none" },
    yAxisConfig: { type: "none" },
    orientation: "vertical",
  };

  const chartMeasured = measureChart(
    rc,
    bounds,
    inputs,
    config,
    responsiveScale,
  );

  const dlMode = mergedStyle.map.dataLabels.mode;
  const needsCalloutMargin = dlMode === "callout" || dlMode === "auto";
  const effectivePadding = needsCalloutMargin
    ? mergedStyle.map.padding + mergedStyle.map.dataLabels.calloutMargin
    : mergedStyle.map.padding;

  const mapPrimitives: Primitive[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type === "chart-grid") {
      const { paneIndex, tierIndex, laneIndex } = prim.meta;
      const cellRcd = prim.plotAreaRcd;
      const valueMap =
        transformedData.valueMaps[paneIndex][tierIndex][laneIndex];

      const { regionPrimitives, fitted, filteredFeatures } =
        generateMapRegionPrimitives(
          cellRcd,
          transformedData.geoFeatures,
          valueMap,
          mergedStyle.map.valueRange === "auto"
            ? transformedData.valueRange
            : mergedStyle.map.valueRange,
          transformedData.areaMatchProp,
          mergedStyle,
          paneIndex,
          tierIndex,
          laneIndex,
          effectivePadding,
        );
      mapPrimitives.push(...regionPrimitives);

      if (dlMode !== "none") {
        mapPrimitives.push(
          ...generateMapLabelPrimitives(
            rc,
            cellRcd,
            filteredFeatures,
            valueMap,
            transformedData.areaMatchProp,
            mergedStyle,
            fitted,
            paneIndex,
            tierIndex,
            laneIndex,
          ),
        );
      }
    }
  }

  return {
    ...chartMeasured,
    primitives: [...chartMeasured.primitives, ...mapPrimitives],
  };
}
