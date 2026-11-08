// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { buildAutoFormatter, createArray } from "../_000_utils/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildItem,
  computeBoundsForPath,
  pathSegmentPoints,
  slotCoordinate,
  slotHeaders,
  textBoxInAnchor,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  DataAxis,
  Decoration,
  FigureLabelPrimitive,
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  Hittable,
  ItemCoordinate,
  MeasuredText,
  PathSegment,
  PieSliceInfo,
  PieSlicePrimitive,
  Primitive,
  PrimitiveItem,
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
  buildDataAxis,
  buildDataLabelTextStyle,
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelPlotExtent,
  calculatePaneGrid,
  checkValuePropsAssignment,
  circleTrack,
  computeFloorScale,
  estimateMinSurroundsWidth,
  fillValuesWithDuplicateCheck,
  generateResolvedFigureLabelPrimitives,
  getHeaderIndex,
  getSubChartHeaders,
  measureChart,
  measureChartWithAutofit,
  PANE_HEADER_SAMPLE_MAX_W,
  placeNearestBoxes,
  placeOutsideBoxes,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveDefaultLegend,
  resolveFigureAutofitOptions,
  resolveFlooredContentScale,
  resolveLabelPlacement,
  resolvePaneGrid,
  SIZING_SAMPLE,
  solveContentScale,
  subChartItemCoordinates,
  validateDataInput,
  validateDistinctDimensions,
  withFigureLabelBounds,
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
  PaneGrid,
  SimplifiedChartConfig,
  SlotAxes,
  SubChartHeaders,
} from "../_007_figure_core/mod.ts";
