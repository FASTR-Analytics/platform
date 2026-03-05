// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { cleanFontFamilyForJsPdf, getFontInfoId } from "../_001_font/mod.ts";
export type { FontInfo } from "../_001_font/mod.ts";
export { RectCoordsDims } from "../_001_geometry/mod.ts";
export { CustomStyle } from "../_006_style/mod.ts";
export type { CustomStyleOptions } from "../_006_style/mod.ts";
export { buildMarkdownPageContents } from "../_105_markdown/mod.ts";
export type { FigureMap, ImageMap } from "../_105_markdown/mod.ts";
export {
  buildFreeformPages,
  measureHeaderFooterHeights,
  PageRenderer,
} from "../_121_page/mod.ts";
export type { PageInputs } from "../_121_page/mod.ts";
export {
  injectKerningIntoJsPdf,
  pagesToPdf,
  patchJsPdfForKerning,
  PdfRenderContext,
} from "../_122_pdf/mod.ts";
export { getTtfFontAbsoluteFilePath } from "../_231_font_paths/mod.ts";
export { registerFontWithSkiaIfNeeded } from "../_232_skia_canvas/mod.ts";
export { Canvas, createCanvas, Fonts } from "@gfx/canvas";
export { jsPDF } from "jspdf";
export type { jsPDF as jsPDFType } from "jspdf";
export { default as opentype } from "opentype.js";
