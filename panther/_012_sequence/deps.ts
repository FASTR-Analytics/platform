// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  phaseProgress,
  resolveTransition,
  transitionTotalMs,
} from "../_001_motion/mod.ts";
export type { Transition } from "../_001_motion/mod.ts";
export type { RenderContext } from "../_001_render_system/mod.ts";
export {
  isMeasuredSceneFigure,
  renderSceneTransitionFrame,
} from "../_010_scene/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type {
  FigureInputs,
  MeasuredFigure,
} from "../_011_figure_renderer/mod.ts";
