// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MapRegionPrimitive,
  MergedMapStyle,
  Primitive,
  RectCoordsDims,
} from "../deps.ts";
import { Z_INDEX } from "../deps.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";
import { getProjectionFn } from "./projections.ts";
import { fitProjection } from "./fit_projection.ts";
import { geoToPathSegments } from "./geo_to_path_segments.ts";
import { resolveColor } from "./color_scale.ts";

export function generateMapRegionPrimitives(
  cellRcd: RectCoordsDims,
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  valueRange: { min: number; max: number },
  areaMatchProp: string,
  mergedStyle: MergedMapStyle,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): Primitive[] {
  const mapStyle = mergedStyle.map;
  const projectionFn = getProjectionFn(mapStyle.projection);

  const filteredFeatures = filterFeatures(geoFeatures, areaMatchProp, mapStyle);

  const fitted = fitProjection(
    filteredFeatures,
    projectionFn,
    cellRcd,
    mapStyle.padding,
  );

  const primitives: Primitive[] = [];

  for (const feature of filteredFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];
    const fillColor = resolveColor(
      value,
      valueRange,
      mapStyle.colorScale,
      mapStyle.noDataColor,
    );

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
        fill: {
          color: fillColor,
          fillRule: "evenodd",
        },
        stroke: mapStyle.regionStrokeWidth > 0
          ? {
            color: mapStyle.regionStrokeColor,
            width: mapStyle.regionStrokeWidth,
          }
          : undefined,
      },
    };
    primitives.push(prim);
  }

  return primitives;
}

function filterFeatures(
  features: GeoJSONFeature[],
  areaMatchProp: string,
  mapStyle: MergedMapStyle["map"],
): GeoJSONFeature[] {
  let filtered = features;

  if (mapStyle.includeAreaIds) {
    const ids = new Set(mapStyle.includeAreaIds);
    filtered = filtered.filter((f) =>
      ids.has(getFeatureMatchKey(f, areaMatchProp))
    );
  }

  if (mapStyle.featureFilter) {
    filtered = filtered.filter(mapStyle.featureFilter);
  }

  return filtered;
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
