// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  getExportDevicePxPerDu,
  REFERENCE_WIDTH_DU,
} from "../_000_consts/mod.ts";
export type { SlideExportSizeOptions } from "../_000_consts/mod.ts";
export { clamp } from "../_000_utils/mod.ts";
export { setKeyColors } from "../_001_color/mod.ts";
export type { KeyColors } from "../_001_color/mod.ts";
export { getFontInfoId, loadFontsWithTimeout } from "../_001_font/mod.ts";
export type { FontInfo } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export {
  buildCanvasRenderContext,
  CanvasRenderContext,
} from "../_002_canvas/mod.ts";
export { CustomFigureStyle } from "../_003_figure_style/mod.ts";
export type { CustomMarkdownStyleOptions } from "../_004_markdown_style/mod.ts";
export { CustomStyle } from "../_006_style/mod.ts";
export type { CustomStyleOptions } from "../_006_style/mod.ts";
export { FigureRenderer } from "../_011_figure_renderer/mod.ts";
export type { FigureInputs } from "../_011_figure_renderer/mod.ts";
export { Csv } from "../_100_csv/mod.ts";
export { buildMarkdownPageContents } from "../_105_markdown/mod.ts";
export type { FigureMap, ImageMap } from "../_105_markdown/mod.ts";
export {
  coreMarkdownToWord,
  DEFAULT_WORD_SPECIFIC_CONFIG,
  wordDocumentToBlob,
} from "../_106_markdown_to_word/mod.ts";
export type { WordSpecificConfig } from "../_106_markdown_to_word/mod.ts";
export {
  buildFreeformPages,
  getFontsForPage,
  measureHeaderFooterHeights,
  PageRenderer,
} from "../_121_page/mod.ts";
export type { PageInputs } from "../_121_page/mod.ts";
export {
  injectKerningIntoJsPdf,
  pagesToPdf,
  PdfRenderContext,
} from "../_122_pdf/mod.ts";
export { pagesToPptx, PptxGenJS } from "../_122_pptx/mod.ts";
export type {
  CreateCanvasRenderContext,
  PptxGenJSInstance,
} from "../_122_pptx/mod.ts";
export {
  drawFigureAsToolImage,
  drawPageAsToolImage,
} from "../_123_tool_image/mod.ts";
export type {
  DrawnToolImage,
  PageFrame,
  ToolImageSurface,
} from "../_123_tool_image/mod.ts";
export type { Document } from "docx";
export type { jsPDF } from "jspdf";
