// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { getDimensionMembers } from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  DimensionMembership,
  Measured,
  MemberSortConfig,
  Primitive,
  RenderContext,
  Renderer,
  SizeConstraints,
} from "../_001_render_system/mod.ts";
export { splitIntoBreakableChunks } from "../_002_canvas/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedChartOVStyle } from "../_003_figure_style/mod.ts";
export {
  calculateMinSubChartHeight,
  computeTotalGridLineStrokeWidth,
  estimateMinSurroundsWidth,
  estimateMinYValueAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartOVOrOHDataConfigIssues,
  getChartSizeConstraintsByMeasure,
  maxNVisible,
  maxProportionalPaneCategoryAxisExtent,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveValueAxisSubChartHeight,
  SIZING_SAMPLE,
  transformChartOVOrOHJson,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartOVOrOHTransformSpec,
  ChartProbeSizing,
  ChartValueAxisLimits,
  DataConfigIssue,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  SimplifiedChartConfig,
  UncertaintyConfig,
  ValueSort,
} from "../_007_figure_core/mod.ts";
