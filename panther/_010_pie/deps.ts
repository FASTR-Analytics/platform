// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { buildAutoFormatter, createArray } from "../_000_utils/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  computeBoundsForPath,
  createHeaderItems,
  sortHeaderItems,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  FigureLabelPrimitive,
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  PathSegment,
  PieSliceInfo,
  PieSlicePrimitive,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  MergedPieStyle,
  PieLabelMode,
  PieSliceStyle,
} from "../_003_figure_style/mod.ts";
export {
  buildDataLabelTextStyle,
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelPlotExtent,
  calculatePaneGrid,
  checkValuePropsAssignment,
  collectHeaders,
  estimateMinSurroundsWidth,
  fillValuesWithDuplicateCheck,
  generateResolvedFigureLabelPrimitives,
  measureChart,
  measureChartWithAutofit,
  placeOutsideBoxes,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveLabelPlacement,
  solveContentScale,
  validateDataInput,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  DirectionalExtents,
  FigureInputsBase,
  JsonArray,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
  LegendInput,
  MeasuredChartBase,
  OutsidePlacedBox,
  ProcessedHeaders,
  SimplifiedChartConfig,
} from "../_007_figure_core/mod.ts";
