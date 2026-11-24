// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assertNotUndefined,
  createArray,
  isBlankValue,
  sum,
} from "../_000_utils/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildItem,
  createDimensionMember,
  itemCoordinate,
  sortDimensionMembers,
  toDimensionMember,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  DimensionMember,
  Measured,
  MeasuredText,
  MemberSortConfig,
  Primitive,
  RenderContext,
  Renderer,
  SizeConstraints,
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
  assertNoDataConfigIssues,
  buildFitReport,
  computeFloorScale,
  estimateMinSurroundsWidth,
  findFitScaleWithFloor,
  generateSurroundsPrimitives,
  getColumnDimensionFields,
  getColumnNotInRowsIssues,
  getDimensionFields,
  getDimensionId,
  getDimensionNamedTwiceIssues,
  getNoRowsIssues,
  getNotANumberIssues,
  getNoValuePropsIssues,
  getReadFields,
  getRowColumns,
  getTwoRowsOneValueIssues,
  getValuePropFields,
  getValuePropNamedTwiceIssues,
  getValuePropsNotSplitIssues,
  indexRows,
  measureSurrounds,
  memoizeByScale,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveFigureAutofitOptions,
} from "../_007_figure_core/mod.ts";
export type {
  DataConfigField,
  DataConfigIssue,
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  MeasuredSurrounds,
  ValueRange,
} from "../_007_figure_core/mod.ts";
