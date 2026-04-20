// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { getColor } from "../_001_color/mod.ts";
export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export { Z_INDEX } from "../_001_render_system/mod.ts";
export type {
  HeightConstraints,
  MapLabelPrimitive,
  MapRegionInfoFunc,
  MapRegionPrimitive,
  PathSegment,
  Primitive,
  RenderContext,
  Renderer,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  DataLabelStyle,
  MapDataLabelMode,
  MapRegionStyle,
  MergedMapStyle,
} from "../_003_figure_style/mod.ts";
export {
  estimateMinSurroundsWidth,
  isAutoScaleLegendConfig,
  measureChart,
  measureChartWithAutofit,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveAutoScaleLegend,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  MeasuredChartBase,
  SimplifiedChartConfig,
} from "../_007_figure_core/mod.ts";
