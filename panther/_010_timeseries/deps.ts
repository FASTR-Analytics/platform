// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  createArray,
  getTimeFromPeriodId,
  getValidNumberOrUndefined,
  isBlankValue,
} from "../_000_utils/mod.ts";
export type { PeriodType } from "../_000_utils/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { getDimensionMembers } from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  HeightConstraints,
  Measured,
  MemberSortConfig,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedTimeseriesStyle } from "../_003_figure_style/mod.ts";
export {
  buildDataDimension,
  calculateChartValueAxisLimits,
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  checkValuePropsAssignment,
  estimateMinSurroundsWidth,
  estimateMinYValueAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartHeightConstraintsByMeasure,
  getMemberIndex,
  isRowBasedUncertainty,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveValueAxisSubChartHeight,
  SIZING_SAMPLE,
  validateDataInput,
  validateDimensionProps,
  validateUncertaintyConfig,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartValueAxisLimits,
  DataDimensions,
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  SimplifiedChartConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
