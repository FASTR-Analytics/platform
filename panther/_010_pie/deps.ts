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
  MeasuredText,
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
  OutsideLabelPlacement,
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
  circleTrack,
  collectHeaders,
  computeFloorScale,
  estimateMinSurroundsWidth,
  fillValuesWithDuplicateCheck,
  generateResolvedFigureLabelPrimitives,
  getHeaderIndex,
  measureChart,
  measureChartWithAutofit,
  placeNearestBoxes,
  placeOutsideBoxes,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveFigureAutofitOptions,
  resolveFlooredContentScale,
  resolveLabelPlacement,
  solveContentScale,
  validateDataInput,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ContentScaleResult,
  DirectionalExtents,
  FigureInputsBase,
  JsonArray,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
  LegendInput,
  MeasuredChartBase,
  ProcessedHeaders,
  SimplifiedChartConfig,
} from "../_007_figure_core/mod.ts";
