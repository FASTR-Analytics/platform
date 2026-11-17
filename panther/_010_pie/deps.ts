// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { buildAutoFormatter, createArray } from "../_000_utils/mod.ts";
export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildItem,
  compareBlankLast,
  computeBoundsForPath,
  getDimensionMembers,
  isBlankMember,
  itemCoordinate,
  pathSegmentPoints,
  textBoxInAlignRcd,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  DataDimension,
  Decoration,
  DimensionMember,
  FigureLabelPrimitive,
  HeightConstraints,
  Hittable,
  ItemCoordinate,
  MeasuredText,
  MemberSortConfig,
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
  buildDataDimension,
  buildDataLabelTextStyle,
  calculateChartIdealHeight,
  calculateChartMinWidth,
  calculateMinLabelSubChartExtent,
  checkValuePropsAssignment,
  circleTrack,
  computeFloorScale,
  computeNRows,
  estimateMinSurroundsWidth,
  fillValuesWithDuplicateCheck,
  generateResolvedFigureLabelPrimitives,
  getMemberIndex,
  getSubChartMembers,
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
  validateDimensionProps,
  withFigureLabelBounds,
} from "../_007_figure_core/mod.ts";
export type {
  ChartComponentSizes,
  ContentScaleResult,
  DataDimensions,
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
  SubChartMembers,
} from "../_007_figure_core/mod.ts";
