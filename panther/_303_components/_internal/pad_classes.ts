// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PadSize } from "../types.ts";

// Literal class names so the consumer app's Tailwind scan generates them.
const PAD: Record<PadSize, string> = {
  none: "",
  sm: "ui-pad-sm",
  md: "ui-pad",
  lg: "ui-pad-lg",
};

const SPY: Record<PadSize, string> = {
  none: "",
  sm: "ui-spy-sm",
  md: "ui-spy",
  lg: "ui-spy-lg",
};

export function padClass(size: PadSize = "none"): string {
  return PAD[size];
}

export function spyClass(size: PadSize = "none"): string {
  return SPY[size];
}
