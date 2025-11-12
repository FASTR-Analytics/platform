// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { getColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString } from "../_001_color/mod.ts";
export { getFont } from "../_001_font/mod.ts";
export type { FontKeyOrFontInfo, TextInfoUnkeyed } from "../_001_font/mod.ts";
export { Coordinates, Padding, RectCoordsDims } from "../_001_geometry/mod.ts";
export type {
  CoordinatesOptions,
  PaddingOptions,
} from "../_001_geometry/mod.ts";
export type {
  ArrowPrimitive,
  BoxPrimitive,
  LineStyle,
  Measured,
  MeasuredText,
  Primitive,
  RectStyle,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedSimpleVizStyle } from "../_003_figure_style/mod.ts";
export {
  addSurrounds,
  measureSurrounds,
  renderChartPrimitives,
} from "../_007_figure_core/mod.ts";
export type {
  FigureInputsBase,
  MeasuredSurrounds,
} from "../_007_figure_core/mod.ts";
