// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates } from "./coordinates.ts";
import type { RectCoordsDims } from "./rect_coords_dims.ts";

export type AnchorPoint =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export function getAnchorCoords(
  rcd: RectCoordsDims,
  anchor: AnchorPoint,
): Coordinates {
  switch (anchor) {
    case "center":
      return rcd.centerCoords();
    case "top-left":
      return rcd.topLeftCoords();
    case "top-center":
      return rcd.topCenterCoords();
    case "top-right":
      return rcd.topRightCoords();
    case "center-left":
      return rcd.leftCenterCoords();
    case "center-right":
      return rcd.rightCenterCoords();
    case "bottom-left":
      return rcd.bottomLeftCoords();
    case "bottom-center":
      return rcd.bottomCenterCoords();
    case "bottom-right":
      return rcd.bottomRightCoords();
  }
}
