// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { Coordinates, RectCoordsDims } from "../_001_geometry/mod.ts";
export { Z_INDEX } from "../_001_render_system/mod.ts";
export type {
  Arrowhead,
  HeightConstraints,
  Measured,
  MeasuredText,
  PathSegment,
  Primitive,
  RenderContext,
  Renderer,
  VizGraphEdgePrimitive,
  VizGraphNodeInfo,
  VizGraphNodePrimitive,
  VizGraphUnfoldedGroupPrimitive,
} from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedVizGraphStyle } from "../_003_figure_style/mod.ts";
export {
  buildFitReport,
  computeFloorScale,
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
  ResolvedFigureAutofitOptions,
} from "../_007_figure_core/mod.ts";
export { findFitScaleWithFloor } from "../_007_figure_core/mod.ts";
export {
  DEFAULT_SPACING,
  layout,
  pathRenderCommands,
  pathRenderCommandsClosedRing,
} from "../_009_vizgraph/mod.ts";
export type {
  Constraints,
  GapRange,
  Geometry,
  GraphModel,
  GroupIn,
  LayoutOptions,
  NodeMeasurer,
  PathCommand,
  PathSpec,
  Pt,
  Spacing,
} from "../_009_vizgraph/mod.ts";
