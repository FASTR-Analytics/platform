// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  getTimeFromPeriodId,
  getValidNumberOrUndefined,
  isBlankValue,
} from "../_000_utils/mod.ts";
export type { PeriodType } from "../_000_utils/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { getDimensionMembers } from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  Measured,
  MemberSortConfig,
  Primitive,
  RenderContext,
  Renderer,
  SizeConstraints,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedTimeseriesStyle } from "../_003_figure_style/mod.ts";
export {
  assertNoDataConfigIssues,
  buildCategoryAndValueLegendSeries,
  buildDataDimension,
  buildSecondValueAxisConfig,
  calculateChartValueAxes,
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  createEmptyValuesArray,
  estimateMinSurroundsWidth,
  estimateMinYValueAxesWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartSizeConstraintsByMeasure,
  getEveryRowBlankIssues,
  getEverySeriesOnSecondValueAxisIssues,
  getMemberIndex,
  getNoRowsIssues,
  getNotAPeriodIssues,
  getRowColumns,
  getUncertaintyMemberId,
  getValuePropNotAPeriodIssues,
  getValuePropsDataConfigIssues,
  indexRows,
  isPeriodCell,
  isRowBasedUncertainty,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  referenceLinesOn,
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
  DataDimensions,
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  ReferenceLineDataConfig,
  SecondValueAxisDataConfig,
  SecondValueAxisDataTransformed,
  SimplifiedChartConfig,
  SubChartTextDataConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
