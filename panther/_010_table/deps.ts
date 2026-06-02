// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  assertNotUndefined,
  createArray,
  sum,
} from "../_000_utils/mod.ts";
export { getAdjustedColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString } from "../_001_color/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  resolveSortFunc,
  toHeaderItem,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  HeaderItem,
  HeaderSortConfig,
  HeaderSortFunc,
  HeightConstraints,
  Measured,
  MeasuredText,
  Primitive,
  RenderContext,
  Renderer,
  TableBorderPrimitive,
  TableCellInfo,
  TableGridPrimitive,
  TableHeaderAxisPrimitive,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  MergedTableStyle,
  TableCellStyle,
} from "../_003_figure_style/mod.ts";
export {
  computeFloorScale,
  estimateMinSurroundsWidth,
  findFitScaleWithFloor,
  generateSurroundsPrimitives,
  measureSurrounds,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveFigureAutofitOptions,
} from "../_007_figure_core/mod.ts";
export type {
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  LegendItem,
  MeasuredSurrounds,
} from "../_007_figure_core/mod.ts";
