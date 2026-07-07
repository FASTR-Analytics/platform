// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  createArray,
  getTimeFromPeriodId,
  getValidNumberOrUndefined,
} from "../_000_utils/mod.ts";
export type { PeriodType } from "../_000_utils/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  createHeaderItems,
  sortHeaderItems,
} from "../_001_render_system/mod.ts";
export type {
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  Measured,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedTimeseriesStyle } from "../_003_figure_style/mod.ts";
export {
  calculateChartScaleLimits,
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  checkValuePropsAssignment,
  collectHeaders,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  getChartHeightConstraintsByMeasure,
  getHeaderIndex,
  isRowBasedUncertainty,
  measureChart,
  measureChartWithAutofit,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveScaleAxisPlotHeight,
  validateDataInput,
  validateUncertaintyConfig,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartScaleAxisLimits,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  MeasuredSurrounds,
  PaneLayout,
  SimplifiedChartConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
