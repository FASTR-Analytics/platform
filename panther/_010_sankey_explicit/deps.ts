// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { getColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString } from "../_001_color/mod.ts";
export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export type {
  Measured,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedSankeyStyle } from "../_003_figure_style/mod.ts";
export {
  generateSankeyPrimitives,
  generateSurroundsPrimitives,
  measureSurrounds,
  renderFigurePrimitives,
} from "../_007_figure_core/mod.ts";
export type {
  FigureInputsBase,
  MeasuredSurrounds,
  PositionedSankeyLink,
  PositionedSankeyNode,
  SankeyPrimitiveOptions,
} from "../_007_figure_core/mod.ts";
