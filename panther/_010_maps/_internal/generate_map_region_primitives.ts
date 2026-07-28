// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
import type { FittedProjection } from "./fit_projection.ts";
import { geoToPathSegments } from "./geo_to_path_segments.ts";
import { getFeatureMatchKey, type MapCellHeaders } from "./label_shared.ts";

// A feature the cell will actually draw, with its style resolved ONCE (with
// the real value range) — the same resolution the label pass reads, so the
// two can never disagree.
export type ShownMapRegion = {
  feature: GeoJSONFeature;
  featureId: string;
  value: number | undefined;
  style: MapRegionStyle;
};

export function resolveShownRegions(
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  valueRange: { min: number; max: number },
  areaMatchProp: string,
  getStyle: MapRegionInfoFunc<MapRegionStyle>,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
  headers: MapCellHeaders,
): ShownMapRegion[] {
  const shown: ShownMapRegion[] = [];
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
      ...headers,
    });

    if (!style.show) continue;
    shown.push({ feature, featureId, value, style });
  }
  return shown;
}

export function generateMapRegionPrimitives(
  cellRcd: RectCoordsDims,
  shown: ShownMapRegion[],
  fitted: FittedProjection,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): Primitive[] {
  const regionPrimitives: Primitive[] = [];

  for (const { feature, featureId, value, style } of shown) {
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

  return regionPrimitives;
}
