// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  assertNotUndefined,
  createArray,
  sum,
} from "../_000_utils/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildItem,
  createHeaderItem,
  slotCoordinate,
  sortHeaderItems,
  toHeaderItem,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  Measured,
  MeasuredText,
  Primitive,
  RenderContext,
  Renderer,
  TableCellInfo,
  TableCellInfoFunc,
  TableHeaderInfo,
  TableHeaderInfoFunc,
  TableHeaderSampleN,
} from "../_001_render_system/mod.ts";
export {
  applyTextColorStrategy,
  CustomFigureStyle,
} from "../_003_figure_style/mod.ts";
export type {
  MergedTableStyle,
  TableCellStyle,
  TableHeaderStyle,
} from "../_003_figure_style/mod.ts";
export {
  buildFitReport,
  computeFloorScale,
  estimateMinSurroundsWidth,
  findFitScaleWithFloor,
  generateSurroundsPrimitives,
  getDimensionId,
  measureSurrounds,
  memoizeByScale,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveFigureAutofitOptions,
  validateSlotDimensions,
} from "../_007_figure_core/mod.ts";
export type {
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  MeasuredSurrounds,
} from "../_007_figure_core/mod.ts";
