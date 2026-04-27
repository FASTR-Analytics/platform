// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TreatmentPresetConfig } from "./types.ts";

const TREATMENT_PRESETS = {
  default: {
    name: "Default",
    description: "Primary hero surfaces, plain header, primary footer",
    surfaces: {
      cover: { slot: "primary" },
      section: { slot: "primary" },
      header: { treatment: "none", slot: "base100" },
      footer: { treatment: "filled", slot: "primary" },
      content: { treatment: "none", slot: "base100" },
    },
  },
  bold: {
    name: "Bold",
    description: "Header and footer both filled with primary color",
    surfaces: {
      cover: { slot: "primary" },
      section: { slot: "primary" },
      header: { treatment: "filled", slot: "primary" },
      footer: { treatment: "filled", slot: "primary" },
      content: { treatment: "none", slot: "base100" },
    },
  },
  soft: {
    name: "Soft",
    description: "Base200 header, primary footer",
    surfaces: {
      cover: { slot: "primary" },
      section: { slot: "primary" },
      header: { treatment: "filled", slot: "base200" },
      footer: { treatment: "filled", slot: "primary" },
      content: { treatment: "none", slot: "base100" },
    },
  },
  bordered: {
    name: "Bordered",
    description: "Bordered header, no footer fill",
    surfaces: {
      cover: { slot: "primary" },
      section: { slot: "primary" },
      header: { treatment: "bordered", slot: "base100" },
      footer: { treatment: "none", slot: "base100" },
      content: { treatment: "none", slot: "base100" },
    },
  },
  minimal: {
    name: "Minimal",
    description: "No fills, base200 hero surfaces",
    surfaces: {
      cover: { slot: "base200" },
      section: { slot: "base200" },
      header: { treatment: "none", slot: "base100" },
      footer: { treatment: "none", slot: "base100" },
      content: { treatment: "none", slot: "base100" },
    },
  },
} as const satisfies Record<string, TreatmentPresetConfig>;

export type TreatmentPresetId = keyof typeof TREATMENT_PRESETS;

export type TreatmentPreset = TreatmentPresetConfig & { id: TreatmentPresetId };

export function getTreatmentPresets(): TreatmentPreset[] {
  return Object.entries(TREATMENT_PRESETS).map(([id, config]) => ({
    id: id as TreatmentPresetId,
    ...config,
  }));
}

export function getTreatmentPreset(id: TreatmentPresetId): TreatmentPreset {
  const config = TREATMENT_PRESETS[id];
  return { id, ...config };
}
