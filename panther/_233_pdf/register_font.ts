// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type FontInfo,
  getFontInfoId,
  getTtfFontAbsoluteFilePath,
  type jsPDF,
} from "./deps.ts";
import { cleanFontFamilyForJsPdf } from "./font_utils.ts";

// Track registered fonts per PDF instance
const registeredFontsMap: WeakMap<jsPDF, Set<string>> = new WeakMap();
const DEBUG_FONTS = false; // Set to true to enable font registration logging

export function registerFontWithJsPdfIfNeeded(
  pdf: jsPDF,
  fontInfo: FontInfo,
): void {
  const fontInfoId = getFontInfoId(fontInfo);

  // Get or create the set of registered fonts for this PDF instance
  let registeredFonts = registeredFontsMap.get(pdf);
  if (!registeredFonts) {
    registeredFonts = new Set<string>();
    registeredFontsMap.set(pdf, registeredFonts);
  }

  if (registeredFonts.has(fontInfoId)) {
    return;
  }

  if (DEBUG_FONTS) {
    console.log("Registering font", fontInfoId);
  }

  registeredFonts.add(fontInfoId);

  try {
    const absFilePath = getTtfFontAbsoluteFilePath(fontInfo);

    // Map font weight to string representation for jsPDF
    const weightString = String(fontInfo.weight);
    const fontStyle = fontInfo.italic ? "italic" : "normal";

    // Clean font family name for jsPDF compatibility
    const fontFamily = cleanFontFamilyForJsPdf(fontInfo.fontFamily);
    pdf.addFont(absFilePath, fontFamily, fontStyle, weightString);
  } catch (error) {
    registeredFonts.delete(fontInfoId); // Remove from cache if registration failed
    if (DEBUG_FONTS) {
      console.error(`Failed to register font ${fontInfoId}:`, error);
    }
    throw new Error(
      `Could not register TTF font ${fontInfoId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
