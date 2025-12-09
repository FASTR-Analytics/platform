// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo, StyleWithFontRegistration } from "./types.ts";
import { deduplicateFonts } from "./style_helpers.ts";

export function collectFontsFromStyles(
  styles: StyleWithFontRegistration[],
): FontInfo[] {
  const allFonts = styles.flatMap((s) => s.getFontsToRegister());
  return deduplicateFonts(allFonts);
}
