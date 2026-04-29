// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PaletteSlot, SplitAdjustment } from "./types.ts";

export type CoverTreatmentConfig = {
  name: string;
  background: PaletteSlot;
  title: PaletteSlot;
  subTitle: PaletteSlot;
  author: PaletteSlot;
  date: PaletteSlot;
  splitAdjust: SplitAdjustment;
};

const COVER_TREATMENTS: Record<string, CoverTreatmentConfig> = {
  bold: {
    name: "Bold",
    background: "primary",
    title: "primaryContent",
    subTitle: "primaryContentMuted",
    author: "primaryContentMuted",
    date: "primaryContentMuted",
    splitAdjust: { brighten: 0.15 },
  },
  // elegant: {
  //   name: "Elegant",
  //   background: "primary",
  //   title: "base200",
  //   subTitle: "primaryContentMuted",
  //   author: "primaryContentMuted",
  //   date: "primaryContentMuted",
  //   splitAdjust: { brighten: 0.15 },
  // },
  muted: {
    name: "Muted",
    background: "primary",
    title: "base300",
    subTitle: "primaryContentMuted",
    author: "primaryContentMuted",
    date: "primaryContentMuted",
    splitAdjust: { brighten: 0.15 },
  },
  light: {
    name: "Light",
    background: "base300",
    title: "primary",
    subTitle: "baseContentMuted",
    author: "baseContentMuted",
    date: "baseContentMuted",
    splitAdjust: { darken: 0.05 },
  },
  lighter: {
    name: "Lighter",
    background: "base200",
    title: "primary",
    subTitle: "baseContentMuted",
    author: "baseContentMuted",
    date: "baseContentMuted",
    splitAdjust: { darken: 0.05 },
  },
  white: {
    name: "White",
    background: "base100",
    title: "primary",
    subTitle: "baseContentMuted",
    author: "baseContentMuted",
    date: "baseContentMuted",
    splitAdjust: { darken: 0.03 },
  },
  pure: {
    name: "Pure",
    background: "base100",
    title: "baseContent",
    subTitle: "baseContentMuted",
    author: "baseContentMuted",
    date: "baseContentMuted",
    splitAdjust: { darken: 0.03 },
  },
};

export const COVER_TREATMENT_IDS = [
  "bold",
  // "elegant",
  "muted",
  "light",
  "lighter",
  "white",
  "pure",
] as const;

export type CoverTreatmentId = (typeof COVER_TREATMENT_IDS)[number];

export type CoverTreatment = CoverTreatmentConfig & { id: CoverTreatmentId };

export function getCoverTreatments(): CoverTreatment[] {
  return COVER_TREATMENT_IDS.map((id) => ({
    id,
    ...COVER_TREATMENTS[id],
  }));
}

export function getCoverTreatment(id: CoverTreatmentId): CoverTreatment {
  return { id, ...COVER_TREATMENTS[id] };
}
