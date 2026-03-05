// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GeoJSONGeometry, GeoJSONPosition } from "./geojson_types.ts";

export function forEachCoordinate(
  geometry: GeoJSONGeometry,
  fn: (lon: number, lat: number) => void,
): void {
  switch (geometry.type) {
    case "Point":
      fn(geometry.coordinates[0], geometry.coordinates[1]);
      break;
    case "MultiPoint":
    case "LineString":
      for (const coord of geometry.coordinates) {
        fn(coord[0], coord[1]);
      }
      break;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geometry.coordinates) {
        for (const coord of ring) {
          fn(coord[0], coord[1]);
        }
      }
      break;
    case "MultiPolygon":
      for (const polygon of geometry.coordinates) {
        for (const ring of polygon) {
          for (const coord of ring) {
            fn(coord[0], coord[1]);
          }
        }
      }
      break;
    case "GeometryCollection":
      for (const geom of geometry.geometries) {
        forEachCoordinate(geom, fn);
      }
      break;
  }
}

export function getPolygonRings(
  geometry: GeoJSONGeometry,
): GeoJSONPosition[][][] {
  switch (geometry.type) {
    case "Polygon":
      return [geometry.coordinates];
    case "MultiPolygon":
      return geometry.coordinates;
    default:
      return [];
  }
}
