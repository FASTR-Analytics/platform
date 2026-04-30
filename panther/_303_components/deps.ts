// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { _GLOBAL_CANVAS_PIXEL_WIDTH } from "../_000_consts/mod.ts";
export { capitalizeFirstLetter, clamp, createArray, getSortedAlphabetical, isFrench, normalizeTo01, t3, to100Pct0, toNum0, toPct3 } from "../_000_utils/mod.ts";
export { Color } from "../_001_color/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { CanvasRenderContext } from "../_002_canvas/mod.ts";
export { CustomMarkdownStyle } from "../_004_markdown_style/mod.ts";
export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export { CustomPageStyle } from "../_005_page_style/mod.ts";
export { CustomStyle } from "../_006_style/mod.ts";
export { MarkdownRenderer } from "../_105_markdown/mod.ts";
export { deduplicateFonts } from "../_001_font/mod.ts";
export type { FontInfo } from "../_001_font/mod.ts";
export type { LayoutNode } from "../_008_layouter/mod.ts";
export type { CustomStyleOptions } from "../_006_style/mod.ts";
export { getMinimumSpan } from "../_008_layouter/mod.ts";
export type { MeasuredColsLayoutNode, MeasuredLayoutNode } from "../_008_layouter/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type { FigureInputs } from "../_011_figure_renderer/mod.ts";
export { Csv } from "../_100_csv/mod.ts";
export { createMarkdownIt } from "../_105_markdown/mod.ts";
export type { ImageMap } from "../_105_markdown/mod.ts";
export { PageRenderer, buildHitRegions, findHitTarget, getFontsForPage } from "../_121_page/mod.ts";
export type { MeasuredPage, PageContentItem, PageHitTarget, PageHitTargetColDivider, PageHitTargetLayoutItem, PageInputs } from "../_121_page/mod.ts";
export { downloadPdf, loadFontsWithTimeout, markdownToPdfBrowser, releaseCanvasGPUMemory, trackCanvas, untrackCanvas } from "../_301_util_funcs/mod.ts";
export { timQuery } from "../_302_query/mod.ts";
export type { APIResponseWithData } from "../_302_query/mod.ts";
