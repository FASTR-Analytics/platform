// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  isAutoScaleLegendConfig,
  measureChart,
  type MergedMapStyle,
  type Primitive,
  type RectCoordsDims,
  type RenderContext,
  resolveAutoScaleLegend,
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
    resolvedLegend: isAutoScaleLegendConfig(inputs.legend)
      ? resolveAutoScaleLegend(
        inputs.legend,
        customFigureStyle.getValuesColorFunc(),
        transformedData.valueRange,
      )
      : undefined,
  };

  const chartMeasured = measureChart(
    rc,
    bounds,
    inputs,
    config,
    responsiveScale,
  );

  const dlMode = mergedStyle.map.dataLabelMode;
  const needsCalloutMargin = dlMode === "callout" || dlMode === "auto";
  const calloutPadding = needsCalloutMargin ? mergedStyle.map.calloutMargin : 0;

  const mapPrimitives: Primitive[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type === "chart-grid") {
      const { paneIndex, tierIndex, laneIndex } = prim.meta;
      const cellRcd = prim.plotAreaRcd;
      const valueMap =
        transformedData.valueMaps[paneIndex][tierIndex][laneIndex];

      const { regionPrimitives, fitted, shownFeatures, shownFeatureStyles } =
        generateMapRegionPrimitives(
          cellRcd,
          transformedData.geoFeatures,
          valueMap,
          transformedData.valueRange,
          transformedData.areaMatchProp,
          mergedStyle.map.projection,
          mergedStyle.map.fit,
          mergedStyle.content.mapRegions.getStyle,
          paneIndex,
          tierIndex,
          laneIndex,
          calloutPadding,
        );
      mapPrimitives.push(...regionPrimitives);

      if (dlMode !== "none") {
        mapPrimitives.push(
          ...generateMapLabelPrimitives(
            rc,
            cellRcd,
            shownFeatures,
            valueMap,
            transformedData.areaMatchProp,
            mergedStyle,
            fitted,
            shownFeatureStyles,
            mergedStyle.content.mapRegions.textFormatter,
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
