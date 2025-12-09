// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

function normalizeFontFamily(fontFamily: string): string {
  return fontFamily.replaceAll("'", "").replaceAll('"', "").trim();
}

export function quotedFontFamilyForCanvas(fontFamily: string): string {
  const normalized = normalizeFontFamily(fontFamily);
  return `'${normalized}'`;
}

export function cleanFontFamilyForJsPdf(fontFamily: string): string {
  return normalizeFontFamily(fontFamily);
}
