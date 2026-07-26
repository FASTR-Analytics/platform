// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MeasuredText } from "../deps.ts";
import type { LabelMode, LabelPlacement } from "./label_types.ts";

// "auto" keeps a label inside only when the text comfortably fits the space at
// its anchor. One definition of "comfortably" for the whole figure family.
const AUTO_INSIDE_FIT_FRACTION = 0.9;

// "none" is excluded at the type level rather than handled here: a figure that
// draws no labels must skip the whole pass, and a silent fallback would hide
// the miss.
export function resolveLabelPlacement(
  mode: Exclude<LabelMode, "none">,
  insideBox: { w: number; h: number } | undefined,
  mText: MeasuredText,
): LabelPlacement {
  if (mode === "inside") return "inside";
  if (mode === "outside") return "outside";
  if (!insideBox) return "inside";

  return mText.dims.w() <= insideBox.w * AUTO_INSIDE_FIT_FRACTION &&
      mText.dims.h() <= insideBox.h * AUTO_INSIDE_FIT_FRACTION
    ? "inside"
    : "outside";
}
