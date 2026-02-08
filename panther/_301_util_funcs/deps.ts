// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { getFontInfoId } from "../_001_font/mod.ts";
export type { FontInfo } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { CanvasRenderContext } from "../_002_canvas/mod.ts";
export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export { CustomStyle } from "../_006_style/mod.ts";
export type { CustomStyleOptions } from "../_006_style/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type { FigureInputs } from "../_011_figure_renderer/mod.ts";
export { Csv } from "../_100_csv/mod.ts";
export { buildMarkdownPageContents } from "../_105_markdown/mod.ts";
export type { FigureMap, ImageMap } from "../_105_markdown/mod.ts";
export { DEFAULT_WORD_SPECIFIC_CONFIG, coreMarkdownToWord, wordDocumentToBlob } from "../_106_markdown_to_word/mod.ts";
export type { WordSpecificConfig } from "../_106_markdown_to_word/mod.ts";
export { PageRenderer, buildFreeformPages, measureHeaderFooterHeights } from "../_121_page/mod.ts";
export type { PageInputs } from "../_121_page/mod.ts";
export { PdfRenderContext, injectKerningIntoJsPdf, pagesToPdf } from "../_122_pdf/mod.ts";
export { PptxGenJS, pagesToPptx } from "../_122_pptx/mod.ts";
export type { CreateCanvasRenderContext, PptxGenJSInstance } from "../_122_pptx/mod.ts";
export type { Document } from "docx";
export type { jsPDF } from "jspdf";
