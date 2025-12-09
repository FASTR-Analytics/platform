// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  collectFontsFromStyles,
  CustomPageStyle,
  type FontInfo,
  type jsPDF,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
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

  const rcd = new RectCoordsDims([0, 0, width, height]);

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage([width, height]);
    }

    const measured = await PageRenderer.measure(rc, rcd, pages[i]);

    if (measured.warnings.length > 0) {
      console.warn(`Page ${i + 1} layout warnings:`);
      for (const warning of measured.warnings) {
        console.warn(
          `  - ${warning.type}: ${warning.message}${
            warning.path ? ` (at ${warning.path})` : ""
          }`,
        );
      }
    }

    await PageRenderer.render(rc, measured);
  }

  return pdf;
}
