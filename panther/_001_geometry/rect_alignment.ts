// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, AlignV } from "./alignment.ts";
import type { CoordinatesOptions } from "./coordinates.ts";
import { RectCoordsDims } from "./rect_coords_dims.ts";
import type { RectCoordsDimsOptions } from "./rect_coords_dims.ts";

export function getRectAlignmentCoords(
  bounds: RectCoordsDimsOptions,
  alignH: AlignH,
  alignV: AlignV,
): CoordinatesOptions {
  const rcd = new RectCoordsDims(bounds);

  if (alignH === "left" && alignV === "top") {
    return rcd.topLeftCoords();
  } else if (alignH === "center" && alignV === "top") {
    return rcd.topCenterCoords();
  } else if (alignH === "right" && alignV === "top") {
    return rcd.topRightCoords();
  } else if (alignH === "left" && alignV === "middle") {
    return rcd.leftCenterCoords();
  } else if (alignH === "center" && alignV === "middle") {
    return rcd.centerCoords();
  } else if (alignH === "right" && alignV === "middle") {
    return rcd.rightCenterCoords();
  } else if (alignH === "left" && alignV === "bottom") {
    return rcd.bottomLeftCoords();
  } else if (alignH === "center" && alignV === "bottom") {
    return rcd.bottomCenterCoords();
  } else if (alignH === "right" && alignV === "bottom") {
    return rcd.bottomRightCoords();
  }

  return rcd.topLeftCoords();
}
