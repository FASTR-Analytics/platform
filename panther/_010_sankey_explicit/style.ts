// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomFigureStyle, MergedSankeyStyle } from "./deps.ts";

export function getMergedSankeyStyle(
  customFigureStyle: CustomFigureStyle,
): MergedSankeyStyle {
  return customFigureStyle.sankey();
}
