// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GeoJSONFeature } from "./geojson_types.ts";
import type { ProjectionFn } from "./projections.ts";
import { forEachCoordinate } from "./geo_helpers.ts";

export type FittedProjection = {
  project: (lon: number, lat: number) => [number, number];
};

// The features' bbox in raw projection units — the scale-free shape the
// content scale multiplies.
export type ProjectedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
};

export function computeProjectedBounds(
  features: GeoJSONFeature[],
  projectionFn: ProjectionFn,
): ProjectedBounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of features) {
    forEachCoordinate(feature.geometry, (lon, lat) => {
      const [x, y] = projectionFn(lon, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  }

  if (minX === Infinity) return undefined;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// The projection expressed as (scale, centre) rather than (rect, padding)
// (plan D7): the content scale s IS the projection scale, so the label-budget
// solver can fit at an explicit s. Centres the projected bbox on (cx, cy),
// with the same y-flip the old rect fit applied. A degenerate bbox (or
// non-positive scale) projects everything to the centre, mirroring the old
// guard on the 0/0 path.
export function fitProjectionAtScale(
  features: GeoJSONFeature[],
  projectionFn: ProjectionFn,
  scale: number,
  cx: number,
  cy: number,
): FittedProjection {
  const b = computeProjectedBounds(features, projectionFn);
  if (!b || b.w === 0 || b.h === 0 || scale <= 0) {
    return { project: () => [cx, cy] };
  }
  const midX = (b.minX + b.maxX) / 2;
  const halfH = b.h / 2;
  return {
    project(lon: number, lat: number): [number, number] {
      const [px, py] = projectionFn(lon, lat);
      return [
        cx + (px - midX) * scale,
        cy + (b.maxY - py - halfH) * scale,
      ];
    },
  };
}
