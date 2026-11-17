// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { MIN_FONT_SIZE_DU } from "../_000_consts/mod.ts";
export {
  assert,
  BLANK_SENTINEL,
  buildAutoFormatter,
  createArray,
  decodePeriod,
  getFiscalQuarter,
  getFiscalYear,
  getLanguage,
  getPeriodIdFromTime,
  getValidNumberOrUndefined,
  isBlankValue,
  isUnique,
  sum,
  toAbbrevAuto,
} from "../_000_utils/mod.ts";
export type {
  CalendarType,
  FiscalYearRule,
  Language,
  PeriodType,
} from "../_000_utils/mod.ts";
export { getColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString } from "../_001_color/mod.ts";
export { getAdjustedFont } from "../_001_font/mod.ts";
export type { TextInfoUnkeyed } from "../_001_font/mod.ts";
export {
  Coordinates,
  Dimensions,
  Padding,
  RectCoordsDims,
} from "../_001_geometry/mod.ts";
export type { AlignH, AlignV, PaddingOptions } from "../_001_geometry/mod.ts";
export {
  buildItem,
  compareBlankLast,
  computeBoundsForPath,
  createDimensionMembers,
  FIGURE_TEXT_ITEM_KEY,
  getDimensionMembers,
  itemCoordinate,
  labelBoxRcd,
  sortDimensionMembers,
  textBoxInAlignRcd,
  unionRectCoordsDims,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  AreaStyle,
  Arrowhead,
  CascadeArrowInfo,
  ChartAxisPrimitive,
  ChartBarPrimitive,
  ChartCascadeArrowPrimitive,
  ChartConnectorInfo,
  ChartConnectorPrimitive,
  ChartErrorBarPrimitive,
  ChartGridPrimitive,
  ChartHeaderPrimitive,
  ChartSeriesInfo,
  ChartValueInfo,
  DataDimension,
  DataLabel,
  DimensionMember,
  DimensionMembership,
  FigureFitReport,
  FigureLabelPrimitive,
  FigureLegendPrimitive,
  FigureScaleLegendGradientPrimitive,
  FigureScaleLegendSteppedPrimitive,
  FigureTextPrimitive,
  HeightConstraints,
  ItemCoordinate,
  LabelHalo,
  LineStyle,
  MeasuredText,
  MemberSortConfig,
  NestedIdentity,
  PathSegment,
  PieSlicePrimitive,
  PointType,
  Primitive,
  PrimitiveItem,
  RectStyle,
  RenderContext,
  SankeyLinkPrimitive,
  SankeyNodePrimitive,
  ShapePathPrimitive,
  ShapePrimitive,
  SurroundsPrimitive,
  TableBorderPrimitive,
  TableGridPrimitive,
  TableHeaderBorderPrimitive,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type {
  AreaDiffPair,
  ArrowheadFitFallback,
  CascadeArrowStyle,
  CustomFigureStyleOptions,
  DataLabelStyle,
  FigureValuesColorFunc,
  LabelCollisionConfig,
  MergedCascadeArrowStyle,
  MergedChartStyleBase,
  MergedContentStyle,
  MergedGridStyle,
  MergedLegendStyle,
  MergedScaleLegendStyle,
  MergedSurroundsStyle,
  MergedXPeriodAxisStyle,
  MergedXTextAxisStyle,
  MergedXValueAxisStyle,
  MergedYTextAxisStyle,
  MergedYValueAxisStyle,
} from "../_003_figure_style/mod.ts";
