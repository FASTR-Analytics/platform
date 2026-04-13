// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  createArray,
  getFormatterFunc,
  getPeriodIdFromTime,
  getValidNumberOrUndefined,
  isUnique,
  sortAlphabetical,
  sum,
} from "../_000_utils/mod.ts";
export { isFrench } from "../_000_translate/mod.ts";
export type { CalendarType, PeriodType } from "../_000_utils/mod.ts";
export { getColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString, ValuesColorFunc } from "../_001_color/mod.ts";
export { getAdjustedFont } from "../_001_font/mod.ts";
export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export {
  Coordinates,
  Dimensions,
  Padding,
  RectCoordsDims,
} from "../_001_geometry/mod.ts";
export type { PaddingOptions } from "../_001_geometry/mod.ts";
export { computeBoundsForPath, Z_INDEX } from "../_001_render_system/mod.ts";
export type {
  AreaStyle,
  ArrowPrimitive,
  BoxPrimitive,
  CascadeArrowInfo,
  CascadeArrowPrimitive,
  ChartAxisPrimitive,
  ChartBarPrimitive,
  ChartCaptionPrimitive,
  ChartGridPrimitive,
  ChartLabelPrimitive,
  ChartLegendPrimitive,
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabel,
  HeightConstraints,
  LineStyle,
  MapLabelPrimitive,
  MeasuredText,
  PathSegment,
  PointStyle,
  PointType,
  Primitive,
  RectStyle,
  RenderContext,
  SankeyLinkPrimitive,
  SankeyNodePrimitive,
  ScaleLegendGradientPrimitive,
  ScaleLegendSteppedPrimitive,
  TableBorderPrimitive,
  TableGridPrimitive,
  TableHeaderAxisPrimitive,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  CascadeArrowStyle,
  CustomFigureStyleOptions,
  MergedCascadeArrowStyle,
  MergedChartStyleBase,
  MergedContentStyle,
  MergedGridStyle,
  MergedLegendStyle,
  MergedScaleLegendStyle,
  MergedSurroundsStyle,
  MergedXPeriodAxisStyle,
  MergedXScaleAxisStyle,
  MergedXTextAxisStyle,
  MergedYScaleAxisStyle,
  MergedYTextAxisStyle,
} from "../_003_figure_style/mod.ts";
