// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MapAreaInfoFunc,
  MapAreaPrimitive,
  MapAreaStyle,
  Primitive,
  PrimitiveItem,
  SubChartMembers,
  ValueRange,
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
export type ShownMapArea = {
  feature: GeoJSONFeature;
  featureId: string;
  // The map area's member in its sub-chart, which its label names too.
  item: PrimitiveItem | undefined;
  value: number | undefined;
  style: MapAreaStyle;
};

export function resolveShownMapAreas(
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  valueRange: ValueRange,
  dimensions: Pick<MapDataTransformed, "mapArea" | "pane" | "tier" | "lane">,
  getStyle: MapAreaInfoFunc<MapAreaStyle>,
  i_pane: number,
  i_tier: number,
  i_lane: number,
  members: SubChartMembers,
): ShownMapArea[] {
  const shown: ShownMapArea[] = [];
  const subChartCoordinates = subChartItemCoordinates(dimensions, members);
  for (const feature of geoFeatures) {
    const featureId = getFeatureMatchKey(feature, dimensions.mapArea.matchProp);
    const value = valueMap[featureId];

    const style = getStyle({
      featureId,
      value,
      valueMin: valueRange.valueMin,
      valueMax: valueRange.valueMax,
      featureProperties: feature.properties,
      i_pane,
      i_tier,
      i_lane,
      ...members,
    });

    if (!style.show) continue;
    shown.push({
      feature,
      featureId,
      item: buildItem([
        [dimensions.mapArea.name, featureId],
        ...subChartCoordinates,
      ]),
      value,
      style,
    });
  }
  return shown;
}

export function generateMapAreaPrimitives(
  shown: ShownMapArea[],
  fitted: FittedProjection,
  indices: { i_pane: number; i_tier: number; i_lane: number },
  members: SubChartMembers,
): Primitive[] {
  const { i_pane, i_tier, i_lane } = indices;
  const regionPrimitives: Primitive[] = [];

  for (const { feature, featureId, item, value, style } of shown) {
    const pathSegments = geoToPathSegments(feature.geometry, fitted);
    if (pathSegments.length === 0) continue;

    const hasStroke = style.strokeColor !== "none" && style.strokeWidth > 0;
    const bounds = computeBoundsForPath(
      pathSegmentPoints(pathSegments),
      hasStroke ? style.strokeWidth : 0,
    );
    const prim: MapAreaPrimitive = {
      type: "map-area",
      key: `map-area-${i_pane}-${i_tier}-${i_lane}-${featureId}`,
      item,
      part: "body",
      bounds,
      hitBounds: bounds,
      zIndex: Z_INDEX.MAP_REGION,
      meta: {
        featureId,
        i_pane,
        i_tier,
        i_lane,
        ...members,
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
