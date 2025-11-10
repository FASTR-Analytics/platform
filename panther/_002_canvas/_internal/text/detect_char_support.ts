// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo } from "../../deps.ts";

// Character ranges that indicate specific script requirements
const SCRIPT_INDICATORS = {
  // Ethiopian script (Amharic, Tigrinya, etc.)
  ethiopian: /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF]/,

  // Arabic script
  arabic: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/,

  // Hebrew
  hebrew: /[\u0590-\u05FF]/,

  // CJK (Chinese, Japanese, Korean)
  cjk:
    /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/,

  // Devanagari (Hindi, Sanskrit, etc.)
  devanagari: /[\u0900-\u097F]/,

  // Thai
  thai: /[\u0E00-\u0E7F]/,

  // Cyrillic
  cyrillic: /[\u0400-\u04FF\u0500-\u052F]/,

  // Greek
  greek: /[\u0370-\u03FF\u1F00-\u1FFF]/,
};

export function findBestFontForText(
  text: string,
  primaryFont: FontInfo,
  fallbackFonts: FontInfo[],
): FontInfo {
  // Check if text contains any special scripts
  for (const fallbackFont of fallbackFonts) {
    // Only consider fallback fonts with different fontFamily and matching weight and style
    if (
      fallbackFont.fontFamily === primaryFont.fontFamily ||
      fallbackFont.weight !== primaryFont.weight ||
      fallbackFont.italic !== primaryFont.italic
    ) {
      continue;
    }

    // Check if this fallback font is needed based on character detection
    if (
      fallbackFont.fontFamily.toLowerCase().includes("ethiop") ||
      fallbackFont.fontFamily.toLowerCase().includes("nyala") ||
      fallbackFont.fontFamily.toLowerCase().includes("kefa")
    ) {
      // Check for Ethiopian characters
      if (SCRIPT_INDICATORS.ethiopian.test(text)) {
        return fallbackFont;
      }
    }

    // Add more font family checks for other scripts as needed
    // For now, we can also do a generic check for any non-ASCII characters
    if (containsNonLatinCharacters(text)) {
      // If we have non-Latin characters and this is a fallback font,
      // we might want to use it
      return fallbackFont;
    }
  }

  // If no special scripts detected, use primary font
  return primaryFont;
}

function containsNonLatinCharacters(text: string): boolean {
  // Check if text contains characters outside basic Latin and Latin-1 Supplement
  // deno-lint-ignore no-control-regex
  return /[^\u0000-\u00FF]/.test(text);
}
