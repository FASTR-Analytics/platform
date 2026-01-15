// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type FontInfo,
  type jsPDF,
  type PageInputs,
  pagesToPdf,
} from "./deps.ts";
import { createPdfRenderContextWithFontsBrowser } from "./create_pdf_render_context_browser.ts";

export type FontPaths = {
  basePath: string;
  fontMap: Record<string, string>;
};

export async function pagesToPdfBrowser(
  pages: PageInputs[],
  width: number,
  height: number,
  fonts: FontInfo[],
  fontPaths: FontPaths,
): Promise<jsPDF> {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const { pdf, rc } = await createPdfRenderContextWithFontsBrowser(
    width,
    height,
    fonts,
    fontPaths,
  );

  return pagesToPdf(pdf, rc, pages, width, height);
}
