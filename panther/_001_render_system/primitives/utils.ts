// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, RectCoordsDims } from "../deps.ts";
import type { RelativePosition } from "./types.ts";

export function resolvePosition(
  relPos: RelativePosition,
  bounds: RectCoordsDims,
): Coordinates {
  if ("rx" in relPos && "ry" in relPos) {
    return new Coordinates([
      bounds.x() + relPos.rx * bounds.w(),
      bounds.y() + relPos.ry * bounds.h(),
    ]);
  }
  if ("dx" in relPos && "dy" in relPos) {
    return new Coordinates([
      bounds.x() + relPos.dx,
      bounds.y() + relPos.dy,
    ]);
  }
  if ("dx" in relPos && "ry" in relPos) {
    return new Coordinates([
      bounds.x() + relPos.dx,
      bounds.y() + relPos.ry * bounds.h(),
    ]);
  }
  return new Coordinates([
    bounds.x() + relPos.rx * bounds.w(),
    bounds.y() + relPos.dy,
  ]);
}

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
): RectCoordsDims {
  if (coords.length === 0) {
    return new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 });
  }
  const xs = coords.map((c) => c.x());
  const ys = coords.map((c) => c.y());
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return new RectCoordsDims({
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  });
}
