// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCanvas,
  type FontInfo,
  jsPDF,
  patchJsPdfForKerning,
  PdfRenderContext,
  registerFontWithSkiaIfNeeded,
} from "./deps.ts";
import { registerFontWithJsPdfIfNeeded } from "./register_font.ts";

export async function createPdfRenderContextWithFontsDeno(
  width: number,
  height: number,
  fonts?: FontInfo[],
): Promise<{ pdf: jsPDF; rc: PdfRenderContext }> {
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    compress: true,
  });

  if (fonts && fonts.length > 0) {
    for (const font of fonts) {
      await registerFontWithSkiaIfNeeded(font);
      registerFontWithJsPdfIfNeeded(pdf, font);
    }
  }

  // Apply kerning patch after fonts are registered
  patchJsPdfForKerning(pdf);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const rc = new PdfRenderContext(pdf, ctx as any, createCanvas);
  return { pdf, rc };
}
