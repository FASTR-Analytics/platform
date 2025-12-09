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
import { createPdfRenderContextWithFontsDeno } from "./utils.ts";

export async function pagesToPdfDeno(
  pages: PageInputs[],
  width: number,
  height: number,
  fonts?: FontInfo[],
): Promise<jsPDF> {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const fontsToRegister = fonts ?? extractFontsFromPages(pages);

  const { pdf, rc } = await createPdfRenderContextWithFontsDeno(
    width,
    height,
    fontsToRegister,
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

function extractFontsFromPages(pages: PageInputs[]): FontInfo[] {
  const pageStyles = pages
    .map((p) => (p.style ? new CustomPageStyle(p.style) : null))
    .filter((s): s is CustomPageStyle => s !== null);

  return collectFontsFromStyles(pageStyles);
}
