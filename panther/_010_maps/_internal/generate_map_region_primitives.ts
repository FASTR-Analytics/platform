// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MapRegionInfoFunc,
  MapRegionPrimitive,
  MapRegionStyle,
  Primitive,
  RectCoordsDims,
} from "../deps.ts";
import { Z_INDEX } from "../deps.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";
import { getProjectionFn } from "./projections.ts";
import {
  fitProjection,
  type FitProjectionPadding,
  type FittedProjection,
} from "./fit_projection.ts";
import { geoToPathSegments } from "./geo_to_path_segments.ts";

export type MapRegionResult = {
  regionPrimitives: Primitive[];
  fitted: FittedProjection;
  shownFeatures: GeoJSONFeature[];
  shownFeatureStyles: Map<string, MapRegionStyle>;
};

export function generateMapRegionPrimitives(
  cellRcd: RectCoordsDims,
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  valueRange: { min: number; max: number },
  areaMatchProp: string,
  projection: "equirectangular" | "mercator" | "naturalEarth1",
  fit: "all-regions" | "only-regions-in-data",
  getStyle: MapRegionInfoFunc<MapRegionStyle>,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
  padding: FitProjectionPadding,
): MapRegionResult {
  const projectionFn = getProjectionFn(projection);

  const featuresForFitting = fit === "only-regions-in-data"
    ? geoFeatures.filter(
      (f) => getFeatureMatchKey(f, areaMatchProp) in valueMap,
    )
    : geoFeatures;

  const fitted = fitProjection(
    featuresForFitting,
    projectionFn,
    cellRcd,
    padding,
  );

  const regionPrimitives: Primitive[] = [];
  const shownFeatures: GeoJSONFeature[] = [];
  const shownFeatureStyles = new Map<string, MapRegionStyle>();

  for (const feature of geoFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];

    const style = getStyle({
      featureId,
      value,
      valueMin: valueRange.min,
      valueMax: valueRange.max,
      featureProperties: feature.properties,
      paneIndex,
      tierIndex,
      laneIndex,
    });

    if (!style.show) continue;

    shownFeatures.push(feature);
    shownFeatureStyles.set(featureId, style);

    const pathSegments = geoToPathSegments(feature.geometry, fitted);
    if (pathSegments.length === 0) continue;

    const prim: MapRegionPrimitive = {
      type: "map-region",
      key: `map-region-${paneIndex}-${tierIndex}-${laneIndex}-${featureId}`,
      bounds: cellRcd,
      zIndex: Z_INDEX.MAP_REGION,
      meta: { featureId, paneIndex, tierIndex, laneIndex, value },
      pathSegments,
      pathStyle: {
        fill: style.fillColor === "none" ? undefined : {
          color: style.fillColor,
          fillRule: "evenodd",
        },
        stroke: style.strokeColor === "none" || style.strokeWidth <= 0
          ? undefined
          : {
            color: style.strokeColor,
            width: style.strokeWidth,
          },
      },
    };
    regionPrimitives.push(prim);
  }

  return { regionPrimitives, fitted, shownFeatures, shownFeatureStyles };
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
