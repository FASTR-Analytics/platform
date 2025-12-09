// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  cleanFontFamilyForJsPdf,
  type FontInfo,
  getFontInfoId,
  getTtfFontAbsoluteFilePath,
  injectKerningIntoJsPdf,
  type jsPDF,
} from "./deps.ts";

const registeredFontsMap: WeakMap<jsPDF, Set<string>> = new WeakMap();

export function registerFontWithJsPdfIfNeeded(
  pdf: jsPDF,
  fontInfo: FontInfo,
): void {
  const fontInfoId = getFontInfoId(fontInfo);

  let registeredFonts = registeredFontsMap.get(pdf);
  if (!registeredFonts) {
    registeredFonts = new Set<string>();
    registeredFontsMap.set(pdf, registeredFonts);
  }

  if (registeredFonts.has(fontInfoId)) {
    return;
  }

  registeredFonts.add(fontInfoId);

  try {
    const absFilePath = getTtfFontAbsoluteFilePath(fontInfo);
    const weightString = String(fontInfo.weight);
    const fontStyle = fontInfo.italic ? "italic" : "normal";
    const fontFamily = cleanFontFamilyForJsPdf(fontInfo.fontFamily);
    pdf.addFont(absFilePath, fontFamily, fontStyle, weightString);

    // Inject kerning and width data for proper text spacing
    injectKerningIntoJsPdf(
      pdf,
      fontInfoId,
      fontFamily,
      fontStyle,
      weightString,
    );
  } catch (error) {
    registeredFonts.delete(fontInfoId);
    throw new Error(
      `Could not register TTF font ${fontInfoId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
