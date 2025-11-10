// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo } from "./deps.ts";

export type TextRenderingOptions = {
  checkCharSupport?: boolean;
  fallbackFonts: FontInfo[];
};

export const DEFAULT_TEXT_RENDERING_OPTIONS: TextRenderingOptions = {
  checkCharSupport: false,
  fallbackFonts: [],
};
