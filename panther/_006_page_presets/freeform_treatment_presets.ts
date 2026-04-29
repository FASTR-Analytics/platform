// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PaletteSlot, SplitAdjustment } from "./types.ts";

export type HeaderTreatmentType = "none" | "filled" | "bordered";

export type FreeformTreatmentConfig = {
  name: string;
  header: {
    treatment: HeaderTreatmentType;
    background: PaletteSlot;
    text: PaletteSlot;
  };
  footer: {
    treatment: "none" | "filled";
    background: PaletteSlot;
    text: PaletteSlot;
  };
  content: {
    background: PaletteSlot;
  };
  splitAdjust: SplitAdjustment;
};

const FREEFORM_TREATMENTS: Record<string, FreeformTreatmentConfig> = {
  bold: {
    name: "Bold",
    header: {
      treatment: "filled",
      background: "primary",
      text: "primaryContent",
    },
    footer: {
      treatment: "filled",
      background: "primary",
      text: "primaryContent",
    },
    content: { background: "base100" },
    splitAdjust: { brighten: 0.15 },
  },
  "header-only": {
    name: "Header Only",
    header: {
      treatment: "filled",
      background: "primary",
      text: "primaryContent",
    },
    footer: { treatment: "none", background: "base100", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { brighten: 0.15 },
  },
  classic: {
    name: "Classic Black",
    header: { treatment: "none", background: "base100", text: "baseContent" },
    footer: {
      treatment: "filled",
      background: "primary",
      text: "primaryContent",
    },
    content: { background: "base100" },
    splitAdjust: { brighten: 0.15 },
  },
  accent: {
    name: "Classic Colored",
    header: { treatment: "none", background: "base100", text: "primary" },
    footer: {
      treatment: "filled",
      background: "primary",
      text: "primaryContent",
    },
    content: { background: "base100" },
    splitAdjust: { brighten: 0.15 },
  },
  soft: {
    name: "Soft Black",
    header: { treatment: "none", background: "base100", text: "baseContent" },
    footer: { treatment: "filled", background: "base200", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
  "soft-accent": {
    name: "Soft Colored",
    header: { treatment: "none", background: "base100", text: "primary" },
    footer: { treatment: "filled", background: "base200", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
  bordered: {
    name: "Bordered Black",
    header: {
      treatment: "bordered",
      background: "base100",
      text: "baseContent",
    },
    footer: { treatment: "none", background: "base100", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
  "bordered-accent": {
    name: "Bordered Colored",
    header: { treatment: "bordered", background: "base100", text: "primary" },
    footer: { treatment: "none", background: "base100", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
  minimal: {
    name: "Minimal Black",
    header: { treatment: "none", background: "base100", text: "baseContent" },
    footer: { treatment: "none", background: "base100", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
  "minimal-accent": {
    name: "Minimal Colored",
    header: { treatment: "none", background: "base100", text: "primary" },
    footer: { treatment: "none", background: "base100", text: "baseContent" },
    content: { background: "base100" },
    splitAdjust: { darken: 0.03 },
  },
};

export const FREEFORM_TREATMENT_IDS = [
  "bold",
  "header-only",
  "classic",
  "accent",
  "soft",
  "soft-accent",
  "bordered",
  "bordered-accent",
  "minimal",
  "minimal-accent",
] as const;

export type FreeformTreatmentId = (typeof FREEFORM_TREATMENT_IDS)[number];

export type FreeformTreatment = FreeformTreatmentConfig & {
  id: FreeformTreatmentId;
};

export function getFreeformTreatments(): FreeformTreatment[] {
  return FREEFORM_TREATMENT_IDS.map((id) => ({
    id,
    ...FREEFORM_TREATMENTS[id],
  }));
}

export function getFreeformTreatment(
  id: FreeformTreatmentId,
): FreeformTreatment {
  return { id, ...FREEFORM_TREATMENTS[id] };
}
