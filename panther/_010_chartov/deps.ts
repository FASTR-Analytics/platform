// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { RectCoordsDims } from "../_001_geometry/mod.ts";
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
export type { MergedChartOVStyle } from "../_003_figure_style/mod.ts";
export {
  calculateMinSubChartHeight,
  estimateMinSurroundsWidth,
  estimateMinYAxisWidth,
  getChartHeightConstraintsByMeasure,
  maxProportionalPanePlotExtent,
  maxVisibleCount,
  measureChart,
  measureChartWithAutofit,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveScaleAxisFloorPlotH,
  resolveScaleAxisPlotHeight,
  transformOneWayChartJson,
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
