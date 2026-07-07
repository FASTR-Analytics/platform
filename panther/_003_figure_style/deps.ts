// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  assert,
  m,
  ms,
  msOrNone,
  normalizeTo01,
  toPct0,
} from "../_000_utils/mod.ts";
export type {
  CalendarType,
  TickLabelFormatterOption,
} from "../_000_utils/mod.ts";
export { Color, getAdjustedColor, getColor } from "../_001_color/mod.ts";
export type {
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  ContinuousScaleConfig,
  ScaleConfig,
  ValuesColorFunc,
} from "../_001_color/mod.ts";
export {
  getBaseText,
  getBaseTextInfo,
  getFontsToRegister,
  getTextInfo,
} from "../_001_font/mod.ts";
export type {
  CustomStyleTextOptions,
  FontInfo,
  FontInfoOptions,
  TextInfo,
  TextInfoOptions,
  TextInfoUnkeyed,
} from "../_001_font/mod.ts";
export { msPadding, Padding } from "../_001_geometry/mod.ts";
export type { AnchorPoint, PaddingOptions } from "../_001_geometry/mod.ts";
export type {
  AreaStyle,
  CascadeArrowInfo,
  CascadeArrowInfoFunc,
  ChartConnectorInfo,
  ChartConnectorInfoFunc,
  ChartSeriesInfo,
  ChartSeriesInfoFunc,
  ChartValueInfo,
  ChartValueInfoFunc,
  LineStyle,
  MapRegionInfo,
  MapRegionInfoFunc,
  PointStyle,
  PointType,
  RectStyle,
  TableCellInfo,
  TableCellInfoFunc,
  TableHeaderInfo,
  TableHeaderInfoFunc,
  VizGraphEdgeInfo,
  VizGraphEdgeInfoFunc,
} from "../_001_render_system/mod.ts";
