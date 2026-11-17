// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { Color, getColor } from "../_001_color/mod.ts";
export type { ColorKeyOrString } from "../_001_color/mod.ts";
export { getAdjustedText } from "../_001_font/mod.ts";
export type {
  TextAdjustmentOptions,
  TextInfoUnkeyed,
} from "../_001_font/mod.ts";
export { Coordinates, Padding, RectCoordsDims } from "../_001_geometry/mod.ts";
export type {
  AlignH,
  AlignV,
  PaddingOptions,
  Pt,
  Rect,
} from "../_001_geometry/mod.ts";
export { lerp } from "../_001_motion/mod.ts";
export type { PhaseProgress } from "../_001_motion/mod.ts";
export {
  isShapePrimitive,
  translatePrimitive,
  Z_INDEX,
} from "../_001_render_system/mod.ts";
export type {
  Arrowhead,
  DiagramNodeInfo,
  HeightConstraints,
  Measured,
  MeasuredText,
  PathSegment,
  Primitive,
  RenderContext,
  Renderer,
  ShapeImagePrimitive,
  ShapePathPrimitive,
  ShapeRectPrimitive,
  ShapeTextPrimitive,
  SurroundsPrimitive,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedSceneStyle } from "../_003_figure_style/mod.ts";
export {
  buildFitReport,
  computeFloorScale,
  findFitScaleWithFloor,
  findOptimalScale,
  generateSurroundsPrimitives,
  measureSurrounds,
  memoizeByScale,
  renderFigureBackground,
  renderFigurePrimitives,
  resolveFigureAutofitOptions,
} from "../_007_figure_core/mod.ts";
export type {
  FigureInputsBase,
  MeasuredSurrounds,
} from "../_007_figure_core/mod.ts";
export {
  DEFAULT_SPACING,
  layout,
  pathRenderCommands,
  pathRenderCommandsClosedRing,
  pullBackEnd,
  tween,
} from "../_009_vizgraph/mod.ts";
export type {
  Constraints,
  GapRange,
  Geometry,
  GraphModel,
  LayoutOptions,
  NodeMeasurer,
  PathCommand,
  PathSpec,
  Spacing,
} from "../_009_vizgraph/mod.ts";
