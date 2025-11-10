// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CoordinatesOptions } from "./coordinates.ts";
import { RectCoordsDims } from "./rect_coords_dims.ts";
import type { RectCoordsDimsOptions } from "./rect_coords_dims.ts";

export function getRectAlignmentCoords(
  bounds: RectCoordsDimsOptions,
  hAlign: "center" | "left" | "right",
  vAlign: "top" | "center" | "bottom",
): CoordinatesOptions {
  const rcd = new RectCoordsDims(bounds);

  if (hAlign === "left" && vAlign === "top") {
    return rcd.topLeftCoords();
  } else if (hAlign === "center" && vAlign === "top") {
    return rcd.topCenterCoords();
  } else if (hAlign === "right" && vAlign === "top") {
    return rcd.topRightCoords();
  } else if (hAlign === "left" && vAlign === "center") {
    return rcd.leftCenterCoords();
  } else if (hAlign === "center" && vAlign === "center") {
    return rcd.centerCoords();
  } else if (hAlign === "right" && vAlign === "center") {
    return rcd.rightCenterCoords();
  } else if (hAlign === "left" && vAlign === "bottom") {
    return rcd.bottomLeftCoords();
  } else if (hAlign === "center" && vAlign === "bottom") {
    return rcd.bottomCenterCoords();
  } else if (hAlign === "right" && vAlign === "bottom") {
    return rcd.bottomRightCoords();
  }

  // Should never happen with TypeScript, but just in case
  return rcd.topLeftCoords();
}
