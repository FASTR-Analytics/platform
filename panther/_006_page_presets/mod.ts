// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  COLOR_PRESET_IDS,
  type ColorPreset,
  type ColorPresetId,
  getColorPreset,
  getColorPresets,
} from "./color_presets.ts";
export {
  type BrandColorValidation,
  type ColorTheme,
  resolveColorTheme,
  validateBrandColor,
} from "./color_theme.ts";
export {
  COVER_TREATMENT_IDS,
  type CoverTreatment,
  type CoverTreatmentConfig,
  type CoverTreatmentId,
  getCoverTreatment,
  getCoverTreatments,
} from "./cover_treatment_presets.ts";
export {
  FREEFORM_TREATMENT_IDS,
  type FreeformTreatment,
  type FreeformTreatmentConfig,
  type FreeformTreatmentId,
  getFreeformTreatment,
  getFreeformTreatments,
  type HeaderTreatmentType,
} from "./freeform_treatment_presets.ts";
export {
  getLayoutPreset,
  getLayoutPresets,
  LAYOUT_PRESET_IDS,
  type LayoutPreset,
  type LayoutPresetId,
} from "./layout_presets.ts";
export { type ResolveOptions, resolvePageStyle } from "./resolve.ts";
export type {
  ContentSurface,
  CoverSurface,
  FooterSurface,
  HeaderSurface,
  LayoutPresetConfig,
  PaletteSlot,
  ResolvedPageStyle,
  SectionSurface,
  SplitAdjustment,
  SurfacePaddingConfig,
  SurfaceTreatment,
} from "./types.ts";
