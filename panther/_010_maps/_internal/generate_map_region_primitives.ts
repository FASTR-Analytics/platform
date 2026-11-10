// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MapRegionInfoFunc,
  MapRegionPrimitive,
  MapRegionStyle,
  Primitive,
  PrimitiveItem,
  SubChartHeaders,
} from "../deps.ts";
import {
  buildItem,
  computeBoundsForPath,
  pathSegmentPoints,
  subChartItemCoordinates,
  Z_INDEX,
} from "../deps.ts";
import type { MapDataTransformed } from "../types.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";
import type { FittedProjection } from "./fit_projection.ts";
import { geoToPathSegments } from "./geo_to_path_segments.ts";
import { getFeatureMatchKey } from "./label_shared.ts";

// A feature the cell will actually draw, with its style resolved ONCE (with
// the real value range) — the same resolution the label pass reads, so the
// two can never disagree.
export type ShownMapRegion = {
  feature: GeoJSONFeature;
  featureId: string;
  // The region's area member in its sub-chart, which its label names too.
  item: PrimitiveItem | undefined;
  value: number | undefined;
  style: MapRegionStyle;
};

export function resolveShownRegions(
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  valueRange: { min: number; max: number },
  slots: Pick<MapDataTransformed, "area" | "pane" | "tier" | "lane">,
  getStyle: MapRegionInfoFunc<MapRegionStyle>,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
  headers: SubChartHeaders,
): ShownMapRegion[] {
  const shown: ShownMapRegion[] = [];
  const cellCoordinates = subChartItemCoordinates(slots, headers);
  for (const feature of geoFeatures) {
    const featureId = getFeatureMatchKey(feature, slots.area.matchProp);
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
    shown.push({
      feature,
      featureId,
      item: buildItem([[slots.area.dimension, featureId], ...cellCoordinates]),
      value,
      style,
    });
  }
  return shown;
}

export function generateMapRegionPrimitives(
  shown: ShownMapRegion[],
  fitted: FittedProjection,
  indices: { paneIndex: number; tierIndex: number; laneIndex: number },
  headers: SubChartHeaders,
): Primitive[] {
  const { paneIndex, tierIndex, laneIndex } = indices;
  const regionPrimitives: Primitive[] = [];

  for (const { feature, featureId, item, value, style } of shown) {
    const pathSegments = geoToPathSegments(feature.geometry, fitted);
    if (pathSegments.length === 0) continue;

    const hasStroke = style.strokeColor !== "none" && style.strokeWidth > 0;
    const bounds = computeBoundsForPath(
      pathSegmentPoints(pathSegments),
      hasStroke ? style.strokeWidth : 0,
    );
    const prim: MapRegionPrimitive = {
      type: "map-region",
      key: `map-region-${paneIndex}-${tierIndex}-${laneIndex}-${featureId}`,
      item,
      part: "body",
      bounds,
      hitBounds: bounds,
      zIndex: Z_INDEX.MAP_REGION,
      meta: {
        featureId,
        paneIndex,
        tierIndex,
        laneIndex,
        ...headers,
        value,
      },
      pathSegments,
      pathStyle: {
        fill: style.fillColor === "none" ? undefined : {
          color: style.fillColor,
          fillRule: "evenodd",
        },
        stroke: !hasStroke ? undefined : {
          color: style.strokeColor,
          width: style.strokeWidth,
        },
      },
    };
    regionPrimitives.push(prim);
  }

  return regionPrimitives;
}
