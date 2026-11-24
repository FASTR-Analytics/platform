// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { createArray, getValidNumberOrUndefined } from "../_000_utils/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { getDimensionMembers } from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  MemberSortConfig,
  RenderContext,
  Renderer,
  SizeConstraints,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedScatterStyle } from "../_003_figure_style/mod.ts";
export {
  assertNoDataConfigIssues,
  buildDataDimension,
  buildScatterLegendSeries,
  calculateChartValueAxisLimits,
  calculateMinSubChartHeight,
  calculateMinSubChartWidth,
  createEmptyValuesArray,
  estimateMinSurroundsWidth,
  estimateMinYValueAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartSizeConstraintsByMeasure,
  getColumnDimensionFields,
  getColumnNotInRowsIssues,
  getDimensionFields,
  getDimensionNamedTwiceIssues,
  getMemberIndex,
  getNoRowsIssues,
  getNotANumberIssues,
  getReadFields,
  getRowColumns,
  getTwoRowsOneValueIssues,
  indexRows,
  measureChart,
  measureChartWithAutofit,
  measureXValueAxisHeight,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveValueAxisSubChartHeight,
  SIZING_SAMPLE,
  trimReferenceLineLabels,
  trimSubChartTexts,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartProbeSizing,
  ChartValueAxisLimits,
  DataConfigField,
  DataConfigIssue,
  FigureInputsBase,
  JsonArray,
  MeasuredChartBase,
  PaneGrid,
  ReferenceLine,
  SimplifiedChartConfig,
  SubChartTextDataConfig,
} from "../_007_figure_core/mod.ts";
