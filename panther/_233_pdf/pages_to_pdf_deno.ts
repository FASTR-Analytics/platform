// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomStyle,
  type FontInfo,
  type jsPDF,
  type PageInputs,
  pagesToPdf,
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

  return pagesToPdf(pdf, rc, pages, width, height);
}

function extractFontsFromPages(pages: PageInputs[]): FontInfo[] {
  const allFonts: FontInfo[] = [];
  for (const page of pages) {
    if (page.style) {
      const customStyle = new CustomStyle(page.style);
      allFonts.push(...customStyle.getFontsToRegister());
    }
  }
  // Deduplicate fonts by id
  const seen = new Set<string>();
  return allFonts.filter((f) => {
    const id = `${f.fontFamily}-${f.weight}-${f.italic}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
