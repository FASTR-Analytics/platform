// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TreatmentPresetConfig } from "./types.ts";

const MUTED = { opacity: 0.7 } as const;

const TREATMENT_PRESETS = {
  default: {
    name: "Default",
    description: "Primary hero surfaces, plain header, primary footer",
    surfaces: {
      cover: {
        background: "primary",
        subTitle: MUTED,
        author: MUTED,
        date: MUTED,
      },
      section: { background: "primary", subTitle: MUTED },
      header: { treatment: "none", background: "base100" },
      footer: { treatment: "filled", background: "primary" },
      content: { treatment: "none", background: "base100" },
    },
  },
  bold: {
    name: "Bold",
    description: "Header and footer both filled with primary color",
    surfaces: {
      cover: {
        background: "primary",
        subTitle: MUTED,
        author: MUTED,
        date: MUTED,
      },
      section: { background: "primary", subTitle: MUTED },
      header: { treatment: "filled", background: "primary" },
      footer: { treatment: "filled", background: "primary" },
      content: { treatment: "none", background: "base100" },
    },
  },
  soft: {
    name: "Soft",
    description: "Plain header, base200 footer",
    surfaces: {
      cover: {
        background: "primary",
        subTitle: MUTED,
        author: MUTED,
        date: MUTED,
      },
      section: { background: "primary", subTitle: MUTED },
      header: { treatment: "none", background: "base100" },
      footer: { treatment: "filled", background: "base200" },
      content: { treatment: "none", background: "base100" },
    },
  },
  bordered: {
    name: "Bordered",
    description: "Bordered header, no footer fill",
    surfaces: {
      cover: {
        background: "primary",
        subTitle: MUTED,
        author: MUTED,
        date: MUTED,
      },
      section: { background: "primary", subTitle: MUTED },
      header: { treatment: "bordered", background: "base100" },
      footer: { treatment: "none", background: "base100" },
      content: { treatment: "none", background: "base100" },
    },
  },
  minimal: {
    name: "Minimal",
    description: "No fills, base100 hero surfaces",
    surfaces: {
      cover: {
        background: "base100",
        title: { color: "primary" },
        subTitle: MUTED,
        author: MUTED,
        date: MUTED,
      },
      section: {
        background: "base100",
        title: { color: "primary" },
        subTitle: MUTED,
      },
      header: { treatment: "none", background: "base100" },
      footer: { treatment: "none", background: "base100" },
      content: { treatment: "none", background: "base100" },
    },
  },
} as const satisfies Record<string, TreatmentPresetConfig>;

export const TREATMENT_PRESET_IDS = [
  "default",
  "bold",
  "soft",
  "bordered",
  "minimal",
] as const;

export type TreatmentPresetId = (typeof TREATMENT_PRESET_IDS)[number];

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
