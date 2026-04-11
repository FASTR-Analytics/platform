// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
export type {
  HeightConstraints,
  Measured,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedTimeseriesStyle } from "../_003_figure_style/mod.ts";
export {
  calculateMinSubChartHeight,
  calculateYScaleLimits,
  checkValuePropsAssignment,
  collectHeaders,
  createSortFunction,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  getChartHeightConstraints,
  getHeaderIndex,
  isRowBasedUncertainty,
  measureChart,
  measureChartWithAutofit,
  renderFigureBackground,
  renderFigurePrimitives,
  validateDataInput,
  validateUncertaintyConfig,
  withAnyLabelReplacement,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  LegendItem,
  MeasuredSurrounds,
  SimplifiedChartConfig,
  UncertaintyConfig,
  XPeriodAxisMeasuredInfo,
  YScaleAxisData,
} from "../_007_figure_core/mod.ts";
