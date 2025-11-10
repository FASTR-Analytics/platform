// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { TIM_FONT_SETS } from "./tim_fonts.ts";
import {
  type FontInfo,
  type FontKeyOrFontInfo,
  isFontKeyAsKey,
  type KeyFonts,
  type KeyFontsKey,
} from "./types.ts";

const _KEY_FONTS = new Map<KeyFontsKey, FontInfo>([
  ["main400", TIM_FONT_SETS.Inter.main400],
  ["main700", TIM_FONT_SETS.Inter.main700],
]);

export function setKeyFonts(kf: KeyFonts) {
  _KEY_FONTS.clear();
  _KEY_FONTS.set("main400", kf.main400);
  _KEY_FONTS.set("main700", kf.main700);
}

export function getFont(
  fk: FontKeyOrFontInfo,
  overrides?: Partial<FontInfo>,
): FontInfo {
  if (isFontKeyAsKey(fk)) {
    const finalFont = _KEY_FONTS.get(fk.key);
    if (!finalFont) {
      throw new Error("No font for this font key");
    }
    if (overrides) {
      return { ...finalFont, ...overrides };
    }
    return finalFont;
  }
  if (overrides) {
    return { ...fk, ...overrides };
  }
  return fk;
}
