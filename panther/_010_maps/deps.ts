// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  createHeaderItems,
  sortHeaderItems,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  HeaderItem,
  HeaderSortConfig,
  HeightConstraints,
  MapRegionInfo,
  MapRegionInfoFunc,
  MapRegionPrimitive,
  PathSegment,
  Primitive,
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
  buildDataLabelTextStyle,
  buildDistanceField,
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelPlotExtent,
  calculatePaneGrid,
  estimateMinSurroundsWidth,
  fieldTrack,
  generateResolvedFigureLabelPrimitives,
  isAutoScaleLegendConfig,
  measureChart,
  measureChartWithAutofit,
  placeNearestBoxes,
  placeOutsideBoxes,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveAutoScaleLegend,
  resolveLabelPlacement,
  scaledTrack,
  solveContentScale,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
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
  Point,
  Ring,
  SimplifiedChartConfig,
} from "../_007_figure_core/mod.ts";
