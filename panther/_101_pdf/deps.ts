// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { Color, getAdjustedColor, getColor } from "../_001_color/mod.ts";
export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export {
  Coordinates,
  getRectAlignmentCoords,
  RectCoordsDims,
} from "../_001_geometry/mod.ts";
export type {
  CoordinatesOptions,
  RectCoordsDimsOptions,
} from "../_001_geometry/mod.ts";
export type {
  AreaStyle,
  LineStyle,
  MeasuredRichText,
  MeasuredText,
  PointStyle,
  RectStyle,
  RenderContext,
  RichText,
} from "../_001_render_system/mod.ts";
export { CanvasRenderContext } from "../_002_canvas/mod.ts";
export type { jsPDF } from "jspdf";
