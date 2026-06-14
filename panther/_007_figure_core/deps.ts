// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { MIN_FONT_SIZE_DU } from "../_000_consts/mod.ts";
export {
  assert,
  buildAutoFormatter,
  createArray,
  decodePeriod,
  getPeriodIdFromTime,
  getValidNumberOrUndefined,
  isFrench,
  isUnique,
  sum,
} from "../_000_utils/mod.ts";
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
  Arrowhead,
  ArrowPrimitive,
  BoxPrimitive,
  CascadeArrowInfo,
  CascadeArrowPrimitive,
  ChartAxisPrimitive,
  ChartBarPrimitive,
  ChartCaptionPrimitive,
  ChartConnectorInfo,
  ChartConnectorPrimitive,
  ChartErrorBarPrimitive,
  ChartGridPrimitive,
  ChartLabelPrimitive,
  ChartLegendPrimitive,
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabel,
  FigureFitReport,
  HeaderItem,
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
  ArrowheadFitFallback,
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
