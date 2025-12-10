// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { cleanFontFamilyForJsPdf, collectFontsFromStyles, getFontInfoId } from "../_001_font/mod.ts";
export type { FontInfo } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { CustomFigureStyleOptions } from "../_003_figure_style/mod.ts";
export { CustomMarkdownStyle } from "../_004_markdown_style/mod.ts";
export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export { CustomPageStyle } from "../_005_page_style/mod.ts";
export type { CustomPageStyleOptions } from "../_005_page_style/mod.ts";
export { PdfRenderContext, injectKerningIntoJsPdf, patchJsPdfForKerning } from "../_101_pdf/mod.ts";
export { buildMarkdownPageContents } from "../_105_markdown/mod.ts";
export type { FigureMap, ImageMap } from "../_105_markdown/mod.ts";
export { PageRenderer, buildFreeformPages, measureHeaderFooterHeights } from "../_121_page/mod.ts";
export type { PageInputs } from "../_121_page/mod.ts";
export { getTtfFontAbsoluteFilePath } from "../_231_font_paths/mod.ts";
export { registerFontWithSkiaIfNeeded } from "../_232_skia_canvas/mod.ts";
export { Canvas, Fonts, createCanvas } from "@gfx/canvas";
export { jsPDF } from "jspdf";
export type { jsPDF as jsPDFType } from "jspdf";
export { default as opentype } from "opentype.js";
