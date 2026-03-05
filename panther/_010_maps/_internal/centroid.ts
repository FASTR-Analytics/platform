// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GeoJSONGeometry, GeoJSONPosition } from "./geojson_types.ts";
import { getPolygonRings } from "./geo_helpers.ts";
import type { FittedProjection } from "./fit_projection.ts";

export function computeGeoCentroid(
  geometry: GeoJSONGeometry,
): [number, number] | undefined {
  const polygons = getPolygonRings(geometry);
  if (polygons.length === 0) return undefined;

  let totalArea = 0;
  let cx = 0;
  let cy = 0;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;

    const result = ringCentroid(ring);
    if (result.area === 0) continue;

    const absArea = Math.abs(result.area);
    totalArea += absArea;
    cx += result.cx * absArea;
    cy += result.cy * absArea;
  }

  if (totalArea === 0) return undefined;
  return [cx / totalArea, cy / totalArea];
}

function ringCentroid(
  ring: GeoJSONPosition[],
): { cx: number; cy: number; area: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const cross = xi * yj - xj * yi;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }

  area /= 2;
  if (area === 0) return { cx: 0, cy: 0, area: 0 };
  cx /= 6 * area;
  cy /= 6 * area;
  return { cx, cy, area };
}

export function projectCentroid(
  geoCentroid: [number, number],
  fitted: FittedProjection,
  offset?: { dx: number; dy: number },
): { x: number; y: number } {
  const [sx, sy] = fitted.project(geoCentroid[0], geoCentroid[1]);
  return {
    x: sx + (offset?.dx ?? 0),
    y: sy + (offset?.dy ?? 0),
  };
}

export function computeScreenBBox(
  geometry: GeoJSONGeometry,
  fitted: FittedProjection,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  const polygons = getPolygonRings(geometry);
  if (polygons.length === 0) return undefined;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const coord of ring) {
        const [sx, sy] = fitted.project(coord[0], coord[1]);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
  }

  if (minX === Infinity) return undefined;
  return { minX, minY, maxX, maxY };
}
