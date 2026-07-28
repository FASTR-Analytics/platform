// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataLabelStyle, FigureLabelPrimitive } from "../deps.ts";
import { getColor } from "../deps.ts";

// The halo drawn behind a figure label, from the label's own background/border
// fields. Returns undefined when neither is configured, so the render path can
// skip the rect entirely.
export function buildLabelHalo(
  dl: DataLabelStyle,
): FigureLabelPrimitive["halo"] {
  const fillColor = dl.backgroundColor !== "none"
    ? getColor(dl.backgroundColor)
    : undefined;
  const borderColor = dl.borderWidth > 0 && dl.borderColor !== undefined
    ? getColor(dl.borderColor)
    : undefined;
  const borderWidth = borderColor !== undefined ? dl.borderWidth : undefined;
  if (!fillColor && !borderColor) return undefined;
  return {
    fillColor,
    borderColor,
    borderWidth,
    padding: dl.padding,
    rectRadius: dl.rectRadius,
  };
}
