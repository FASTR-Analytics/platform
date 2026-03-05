// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PathSegment } from "../deps.ts";
import type { GeoJSONGeometry, GeoJSONPosition } from "./geojson_types.ts";
import type { FittedProjection } from "./fit_projection.ts";
import { getPolygonRings } from "./geo_helpers.ts";

export function geoToPathSegments(
  geometry: GeoJSONGeometry,
  fitted: FittedProjection,
): PathSegment[] {
  const segments: PathSegment[] = [];
  const polygons = getPolygonRings(geometry);

  for (const polygon of polygons) {
    for (const ring of polygon) {
      appendRing(segments, ring, fitted);
    }
  }

  return segments;
}

function appendRing(
  segments: PathSegment[],
  ring: GeoJSONPosition[],
  fitted: FittedProjection,
): void {
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = fitted.project(ring[i][0], ring[i][1]);
    if (i === 0) {
      segments.push({ type: "moveTo", x, y });
    } else {
      segments.push({ type: "lineTo", x, y });
    }
  }
}
