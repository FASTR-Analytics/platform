// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  type ColorAdjustmentStrategy,
  getAdjustedColor,
} from "./adjusted_color.ts";
export * from "./color_class.ts";
export type {
  ContinuousScaleConfig,
  ScaleConfig,
} from "./color_scale_funcs.ts";
export {
  KEY_COLOR_THEME_OPTIONS,
  KEY_COLOR_THEMES,
  type KeyColorThemeCategory,
  type KeyColorThemeName,
  type KeyColorThemeOption,
  RECOMMENDED_PALETTES,
} from "./key_color_themes.ts";
export {
  generateKeyColorsFromPrimary,
  getColor,
  getColorAsRgb,
  getKeyColorsFromPrimaryColor,
  setKeyColors,
} from "./key_colors.ts";
export {
  type ContinuousPaletteName,
  type DivergingPaletteName,
  PALETTE_OPTIONS,
  type PaletteCategory,
  type PaletteName,
  type PaletteOption,
  type QualitativePaletteName,
  type SequentialPaletteName,
  TIM_PALETTES,
} from "./palettes.ts";
export { TIM_COLORS } from "./tim_colors.ts";
export type { ColorKeyOrString, KeyColors } from "./types.ts";
export {
  divergingColorFunc,
  sequentialColorFunc,
  thresholdColorFunc,
  type ValuesColorFunc,
} from "./value_color_funcs.ts";
