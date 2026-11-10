// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { slotHeaders } from "../_001_render_system/mod.ts";
export type {
  AxisMembership,
  DataAxis,
  HeaderSortConfig,
  HeightConstraints,
  Measured,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { splitIntoBreakableChunks } from "../_002_canvas/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedChartOVStyle } from "../_003_figure_style/mod.ts";
export {
  calculateMinSubChartHeight,
  estimateMinSurroundsWidth,
  estimateMinYScaleAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartHeightConstraintsByMeasure,
  maxProportionalPanePlotExtent,
  maxVisibleCount,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveScaleAxisFloorPlotH,
  resolveScaleAxisPlotHeight,
  SIZING_SAMPLE,
  transformOneWayChartJson,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartScaleAxisLimits,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  SimplifiedChartConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
