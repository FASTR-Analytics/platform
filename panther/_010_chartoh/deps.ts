// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { getDimensionMembers } from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  DimensionMembership,
  HeightConstraints,
  Measured,
  MemberSortConfig,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedChartOHStyle } from "../_003_figure_style/mod.ts";
export {
  calculateMinSubChartWidth,
  countProportionalSlots,
  estimateMinSurroundsWidth,
  estimateMinYTextAxisWidth,
  estimateTierHeaderAndLabelGapWidth,
  getChartHeightConstraintsByMeasure,
  maxNVisible,
  maxProportionalPaneCategoryAxisExtent,
  measureChart,
  measureChartWithAutofit,
  measureXValueAxisHeight,
  PANE_HEADER_SAMPLE_MAX_W,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  SIZING_SAMPLE,
  transformChartOVOrOHJson,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ChartValueAxisLimits,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  MeasuredSurrounds,
  PaneGrid,
  PaneLayout,
  ResolveFloorExtent,
  ResolveTargetExtent,
  SimplifiedChartConfig,
  UncertaintyConfig,
} from "../_007_figure_core/mod.ts";
