// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { createArray } from "../_000_utils/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  createHeaderItems,
  sortHeaderItems,
} from "../_001_render_system/mod.ts";
export type {
  AxisMembership,
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  Measured,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedChartOHStyle } from "../_003_figure_style/mod.ts";
export {
  calculateChartScaleLimits,
  calculateMinSubChartWidth,
  calculatePaneGrid,
  checkValuePropsAssignment,
  collectHeaders,
  deriveVisibleIndicatorsByPane,
  deriveVisibleIndicatorsByPaneBand,
  deriveVisibleTiersByPane,
  estimateMinSurroundsWidth,
  estimateMinXAxisHeightForScale,
  estimateMinYTextAxisWidth,
  fillValuesWithDuplicateCheck,
  getChartHeightConstraintsByMeasure,
  getHeaderIndex,
  isRowBasedUncertainty,
  maxProportionalPanePlotExtent,
  maxVisibleCount,
  measureChart,
  measureChartWithAutofit,
  proportionalTotalSlots,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveChartProportional,
  resolveDefaultLegend,
  validateChartMembership,
  validateChartProportional,
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
  ProcessedHeaders,
  ResolveFloorPlotH,
  ResolveTargetPlotH,
  SimplifiedChartConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
