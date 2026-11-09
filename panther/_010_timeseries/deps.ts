// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
export { slotHeaders } from "../_001_render_system/mod.ts";
export type {
  DataAxis,
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
  buildDataAxis,
  calculateChartScaleLimits,
  calculateMinSubChartHeight,
  calculateTimeseriesMinSubChartWidth,
  checkValuePropsAssignment,
  estimateMinSurroundsWidth,
  estimateMinYScaleAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartHeightConstraintsByMeasure,
  getHeaderIndex,
  isRowBasedUncertainty,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveScaleAxisPlotHeight,
  SIZING_SAMPLE,
  validateDataInput,
  validateSlotDimensions,
  validateUncertaintyConfig,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartScaleAxisLimits,
  FigureInputsBase,
  JsonArray,
  JsonArrayItem,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  SimplifiedChartConfig,
  SlotAxes,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
