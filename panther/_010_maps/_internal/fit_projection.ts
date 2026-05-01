// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RectCoordsDims } from "../deps.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";
import type { ProjectionFn } from "./projections.ts";
import { forEachCoordinate } from "./geo_helpers.ts";

export type FittedProjection = {
  project: (lon: number, lat: number) => [number, number];
};

export type AsymmetricPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type FitProjectionPadding = number | AsymmetricPadding;

function normalizePadding(padding: FitProjectionPadding): AsymmetricPadding {
  if (typeof padding === "number") {
    return { left: padding, right: padding, top: padding, bottom: padding };
  }
  return padding;
}

export function fitProjection(
  features: GeoJSONFeature[],
  projectionFn: ProjectionFn,
  cellRcd: RectCoordsDims,
  padding: FitProjectionPadding,
): FittedProjection {
  const pad = normalizePadding(padding);

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

  const projW = maxX - minX;
  const projH = maxY - minY;
  if (projW === 0 || projH === 0) {
    return { project: () => [cellRcd.centerX(), cellRcd.centerY()] };
  }

  const availW = cellRcd.w() - pad.left - pad.right;
  const availH = cellRcd.h() - pad.top - pad.bottom;
  const scale = Math.min(availW / projW, availH / projH);

  const scaledW = projW * scale;
  const scaledH = projH * scale;
  const offsetX = cellRcd.x() + pad.left + (availW - scaledW) / 2;
  const offsetY = cellRcd.y() + pad.top + (availH - scaledH) / 2;

  return {
    project(lon: number, lat: number): [number, number] {
      const [px, py] = projectionFn(lon, lat);
      return [
        offsetX + (px - minX) * scale,
        offsetY + (maxY - py) * scale,
      ];
    },
  };
}
