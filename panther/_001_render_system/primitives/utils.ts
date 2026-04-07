// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Coordinates, RectCoordsDims } from "../deps.ts";

export function computeBoundsForPoint(
  coords: Coordinates,
  radius: number,
): RectCoordsDims {
  return new RectCoordsDims({
    x: coords.x() - radius,
    y: coords.y() - radius,
    w: radius * 2,
    h: radius * 2,
  });
}

export function computeBoundsForPath(
  coords: Coordinates[],
  strokeWidth: number = 0,
): RectCoordsDims {
  if (coords.length === 0) {
    return new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 });
  }
  const xs = coords.map((c) => c.x());
  const ys = coords.map((c) => c.y());
  const halfStroke = strokeWidth / 2;
  const minX = Math.min(...xs) - halfStroke;
  const maxX = Math.max(...xs) + halfStroke;
  const minY = Math.min(...ys) - halfStroke;
  const maxY = Math.max(...ys) + halfStroke;
  return new RectCoordsDims({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });
}
