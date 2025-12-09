// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { collectFontsFromStyles } from "./collect_fonts.ts";
export {
  cleanFontFamilyForJsPdf,
  quotedFontFamilyForCanvas,
} from "./font_family_helpers.ts";
export { TIM_FONTS } from "./generated/fonts.ts";
export { FONT_KERNING } from "./generated/kerning.ts";
export { FONT_MAP } from "./generated/map.ts";
export type { FontId } from "./generated/map.ts";
export {
  deduplicateFonts,
  deriveAllVariants,
  getBaseTextInfo,
  getFontsToRegister,
  getMergedFonts,
  getTextInfo,
  getTextInfoForSpecialHeadings,
} from "./style_helpers.ts";
export {
  type CustomStyleTextOptions,
  type FontInfo,
  type FontInfoOptions,
  type FontWeight,
  getAdjustedFont,
  getAdjustedText,
  getBaseText,
  getFontInfoId,
  setBaseText,
  type StyleWithFontRegistration,
  type TextAdjustmentOptions,
  type TextInfo,
  type TextInfoOptions,
  type TextInfoUnkeyed,
} from "./types.ts";
