// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  getLayoutPreset,
  getLayoutPresets,
  LAYOUT_PRESET_IDS,
  type LayoutPreset,
  type LayoutPresetId,
} from "./layout_presets.ts";
export { resolvePageStyle, type ResolveOptions } from "./resolve.ts";
export {
  getTreatmentPreset,
  getTreatmentPresets,
  TREATMENT_PRESET_IDS,
  type TreatmentPreset,
  type TreatmentPresetId,
} from "./treatment_presets.ts";
export type {
  ContentAssignment,
  FreeformSplitAssignment,
  LayoutPresetConfig,
  PaletteSlot,
  ResolvedPageStyle,
  SplitBackgroundConfig,
  SplitSurfaceAssignment,
  SurfaceAssignment,
  SurfacePaddingConfig,
  SurfaceTreatment,
  TreatmentPresetConfig,
} from "./types.ts";
