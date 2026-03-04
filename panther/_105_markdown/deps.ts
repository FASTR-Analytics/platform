// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type { FontWeight, TextInfoUnkeyed } from "../_001_font/mod.ts";
export { Coordinates, Dimensions, RectCoordsDims } from "../_001_geometry/mod.ts";
export type { HeightConstraints, LineStyle, Measured, MeasuredText, RenderContext, Renderer } from "../_001_render_system/mod.ts";
export { CustomMarkdownStyle } from "../_004_markdown_style/mod.ts";
export type { CustomMarkdownStyleOptions, MergedMarkdownStyle } from "../_004_markdown_style/mod.ts";
export { createItemNode } from "../_008_layouter/mod.ts";
export type { ItemLayoutNode, LayoutNode } from "../_008_layouter/mod.ts";
export { TableRenderer } from "../_010_table/mod.ts";
export type { TableData, TableInputs } from "../_010_table/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type { FigureInputs } from "../_011_figure_renderer/mod.ts";
export { ImageRenderer } from "../_012_image_renderer/mod.ts";
export type { ImageInputs } from "../_012_image_renderer/mod.ts";
export { MarkdownRenderer } from "./markdown_renderer.ts";
export { createMarkdownIt } from "./parser.ts";
export type { ImageMap, MarkdownRendererInput } from "./types.ts";
export { default as markdownItKatex } from "@vscode/markdown-it-katex";
export { default as MarkdownIt } from "markdown-it";
