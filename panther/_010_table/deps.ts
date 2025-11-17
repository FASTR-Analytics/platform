// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { assert, createArray, sortAlphabetical, sum } from "../_000_utils/mod.ts";
export { getColor } from "../_001_color/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export type { Measured, MeasuredText, RenderContext, Renderer } from "../_001_render_system/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { MergedTableStyle } from "../_003_figure_style/mod.ts";
export { addSurrounds } from "../_007_figure_core/_surrounds/add_surrounds.ts";
export { measureSurrounds, withAnyLabelReplacement } from "../_007_figure_core/mod.ts";
export type { FigureInputsBase, JsonArray, JsonArrayItem, LegendItem, MeasuredSurrounds } from "../_007_figure_core/mod.ts";
