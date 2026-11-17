// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { getStage2Sizing } from "../_000_consts/mod.ts";
export type { SizingMode } from "../_000_consts/mod.ts";
export { runWithDarkKeyColors } from "../_001_color/mod.ts";
export { loadFontsWithTimeout } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  lerp,
  phaseProgress,
  resolveTransition,
  transitionTotalMs,
} from "../_001_motion/mod.ts";
export type { Transition } from "../_001_motion/mod.ts";
export { isShapePrimitive } from "../_001_render_system/mod.ts";
export type { Primitive } from "../_001_render_system/mod.ts";
export { CanvasRenderContext } from "../_002_canvas/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { FigureInputsBase } from "../_007_figure_core/mod.ts";
export { getMinimumSpan } from "../_008_layouter/mod.ts";
export type {
  MeasuredColsLayoutNode,
  MeasuredLayoutNode,
} from "../_008_layouter/mod.ts";
export {
  isMeasuredSceneFigure,
  renderSceneTransitionFrame,
} from "../_010_scene/mod.ts";
export type { MeasuredSceneFigure } from "../_010_scene/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type {
  FigureInputs,
  MeasuredFigure,
} from "../_011_figure_renderer/mod.ts";
export { resolveSequence } from "../_012_sequence/mod.ts";
export type { SequenceInputs } from "../_012_sequence/mod.ts";
export {
  buildHitRegions,
  findHitTarget,
  getFontsForPage,
  PageRenderer,
} from "../_121_page/mod.ts";
export type {
  MeasuredPage,
  PageContentItem,
  PageHitTarget,
  PageHitTargetColDivider,
  PageHitTargetLayoutItem,
  PageInputs,
} from "../_121_page/mod.ts";
export {
  createCanvasBrowser,
  releaseCanvasGPUMemory,
  trackCanvas,
  untrackCanvas,
} from "../_301_util_funcs/mod.ts";
export { effectiveScheme } from "../_303_components/mod.ts";
