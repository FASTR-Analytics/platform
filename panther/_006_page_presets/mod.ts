// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  getLayoutPreset,
  getLayoutPresets,
  type LayoutPreset,
  type LayoutPresetId,
} from "./layout_presets.ts";
export {
  resolvePageStyle,
  type ResolveOptions,
} from "./resolve.ts";
export {
  getTreatmentPreset,
  getTreatmentPresets,
  type TreatmentPreset,
  type TreatmentPresetId,
} from "./treatment_presets.ts";
export type {
  ContentAssignment,
  HeroSurfaceAssignment,
  LayoutPresetConfig,
  PaletteSlot,
  ResolvedPageStyle,
  SurfaceAssignment,
  SurfacePaddingConfig,
  SurfaceTreatment,
  TreatmentPresetConfig,
} from "./types.ts";
