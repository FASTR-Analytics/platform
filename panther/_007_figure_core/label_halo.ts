// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataLabelStyle, LabelHalo } from "./deps.ts";

export function buildLabelHalo(dl: DataLabelStyle): LabelHalo | undefined {
  const fillColor = dl.backgroundColor !== "none"
    ? dl.backgroundColor
    : undefined;
  const borderColor = dl.borderWidth > 0 && dl.borderColor !== "none"
    ? dl.borderColor
    : undefined;
  if (fillColor === undefined && borderColor === undefined) {
    return undefined;
  }
  return {
    fillColor,
    borderColor,
    borderWidth: borderColor !== undefined ? dl.borderWidth : undefined,
    padding: dl.padding,
    rectRadius: dl.rectRadius,
  };
}
