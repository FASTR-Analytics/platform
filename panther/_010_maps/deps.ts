// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildItem,
  computeBoundsForPath,
  pathSegmentPoints,
  slotHeaders,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  DataAxis,
  HeaderSortConfig,
  HeightConstraints,
  MapRegionInfo,
  MapRegionInfoFunc,
  MapRegionPrimitive,
  PathSegment,
  Primitive,
  PrimitiveItem,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  MapDataLabelMode,
  MapRegionStyle,
  MergedMapStyle,
  OutsideLabelPlacement,
} from "../_003_figure_style/mod.ts";
export {
  buildDataAxis,
  buildDataLabelTextStyle,
  buildDistanceField,
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelPlotExtent,
  computeFloorScale,
  estimateMinSurroundsWidth,
  fieldTrack,
  generateResolvedFigureLabelPrimitives,
  getHeaderIndex,
  getSubChartHeaders,
  isAutoScaleLegendConfig,
  measureChart,
  measureChartWithAutofit,
  placeNearestBoxes,
  placeOutsideBoxes,
  readDimensionId,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveAutoScaleLegend,
  resolveFigureAutofitOptions,
  resolveFlooredContentScale,
  resolveLabelPlacement,
  resolvePaneGrid,
  scaledTrack,
  solveContentScale,
  subChartItemCoordinates,
  validateDistinctDimensions,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ContentScaleResult,
  DirectionalExtents,
  DistanceField,
  FigureInputsBase,
  JsonArray,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
  LabelTrack,
  LegendInput,
  MeasuredChartBase,
  PaneGrid,
  Point,
  Ring,
  SimplifiedChartConfig,
  SubChartHeaders,
} from "../_007_figure_core/mod.ts";
