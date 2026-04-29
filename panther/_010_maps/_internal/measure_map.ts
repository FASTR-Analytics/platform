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
  type TextInfoUnkeyed,
} from "../deps.ts";
import { getColor } from "../deps.ts";
import { getMapDataTransformed } from "../get_map_data.ts";
import type { MapDataTransformed, MapInputs, MeasuredMap } from "../types.ts";
import { generateMapRegionPrimitives } from "./generate_map_region_primitives.ts";
import { generateMapLabelPrimitives } from "./generate_map_label_primitives.ts";
import { type AsymmetricPadding, fitProjection } from "./fit_projection.ts";
import { getProjectionFn } from "./projections.ts";
import {
  computeGeoCentroid,
  computeScreenBBox,
  findExtremeBoundaryVertex,
  projectCentroid,
} from "./centroid.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";

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
  const useV2 = mergedStyle.map.labelPositioning === "v2";

  const mapPrimitives: Primitive[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type === "chart-grid") {
      const { paneIndex, tierIndex, laneIndex } = prim.meta;
      const cellRcd = prim.plotAreaRcd;
      const valueMap =
        transformedData.valueMaps[paneIndex][tierIndex][laneIndex];

      let padding: number | AsymmetricPadding;

      if (useV2 && dlMode !== "none") {
        padding = calculateV2Padding(
          rc,
          cellRcd,
          transformedData.geoFeatures,
          valueMap,
          transformedData.areaMatchProp,
          mergedStyle,
          paneIndex,
          tierIndex,
          laneIndex,
        );
      } else {
        const needsCalloutMargin = dlMode === "callout" || dlMode === "auto";
        padding = needsCalloutMargin ? mergedStyle.map.calloutMargin : 0;
      }

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
          padding,
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

function calculateV2Padding(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  areaMatchProp: string,
  mergedStyle: MergedMapStyle,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): AsymmetricPadding {
  const dlMode = mergedStyle.map.dataLabelMode;
  const gap = mergedStyle.map.labelCollision.gap;
  const baseTextStyle = mergedStyle.text.dataLabels;
  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  const featuresForFitting = mergedStyle.map.fit === "only-regions-in-data"
    ? geoFeatures.filter(
      (f) => getFeatureMatchKey(f, areaMatchProp) in valueMap,
    )
    : geoFeatures;

  const preliminaryFit = fitProjection(
    featuresForFitting,
    projectionFn,
    cellRcd,
    0,
  );

  let maxLeftWidth = 0;
  let maxRightWidth = 0;
  const centerX = cellRcd.centerX();

  for (const feature of geoFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];

    const regionStyle = mergedStyle.content.mapRegions.getStyle({
      featureId,
      value,
      valueMin: 0,
      valueMax: 0,
      featureProperties: feature.properties,
      paneIndex,
      tierIndex,
      laneIndex,
    });
    if (!regionStyle.show || !regionStyle.dataLabel.show) continue;

    const geoCentroid = computeGeoCentroid(feature.geometry);
    if (!geoCentroid) continue;

    const screenPos = projectCentroid(
      geoCentroid,
      preliminaryFit,
      regionStyle.centroidOffset,
    );
    const screenBBox = dlMode === "auto"
      ? computeScreenBBox(feature.geometry, preliminaryFit)
      : undefined;

    const textFormatter = mergedStyle.content.mapRegions.textFormatter;
    const mapRegionInfo = {
      featureId,
      value,
      valueMin: 0,
      valueMax: 0,
      featureProperties: feature.properties,
      paneIndex,
      tierIndex,
      laneIndex,
    };
    const labelText = textFormatter !== "none"
      ? textFormatter(mapRegionInfo)
      : value !== undefined
      ? String(value)
      : featureId;
    if (!labelText) continue;

    const dlStyle = regionStyle.dataLabel;
    const textStyle: TextInfoUnkeyed = {
      ...baseTextStyle,
      ...(dlStyle.color !== undefined
        ? { color: getColor(dlStyle.color) }
        : {}),
      ...(dlStyle.relFontSize !== undefined
        ? { fontSize: baseTextStyle.fontSize * dlStyle.relFontSize }
        : {}),
    };
    const mText = rc.mText(labelText, textStyle, cellRcd.w() * 0.4);

    const placement = resolvePlacementForPadding(
      dlMode as "centroid" | "callout" | "auto",
      screenBBox,
      mText,
    );
    if (placement !== "callout") continue;

    const side = screenPos.x <= centerX ? "left" : "right";
    const labelWidth = mText.dims.w();

    if (side === "left") {
      maxLeftWidth = Math.max(maxLeftWidth, labelWidth);
    } else {
      maxRightWidth = Math.max(maxRightWidth, labelWidth);
    }
  }

  return {
    left: maxLeftWidth > 0 ? maxLeftWidth + gap * 2 : 0,
    right: maxRightWidth > 0 ? maxRightWidth + gap * 2 : 0,
    top: 0,
    bottom: 0,
  };
}

function resolvePlacementForPadding(
  mode: "centroid" | "callout" | "auto",
  screenBBox:
    | { minX: number; minY: number; maxX: number; maxY: number }
    | undefined,
  mText: ReturnType<RenderContext["mText"]>,
): "centroid" | "callout" {
  if (mode === "centroid") return "centroid";
  if (mode === "callout") return "callout";
  if (!screenBBox) return "centroid";

  const textW = mText.dims.w();
  const textH = mText.dims.h();
  const bboxW = screenBBox.maxX - screenBBox.minX;
  const bboxH = screenBBox.maxY - screenBBox.minY;

  return textW <= bboxW * 0.9 && textH <= bboxH * 0.9 ? "centroid" : "callout";
}

function getFeatureMatchKey(
  feature: GeoJSONFeature,
  areaMatchProp: string,
): string {
  const val = feature.properties[areaMatchProp];
  if (val !== undefined && val !== null) return String(val);
  if (feature.id !== undefined) return String(feature.id);
  return "";
}
