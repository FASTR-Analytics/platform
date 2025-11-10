// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type KeyColors = {
  base100: string;
  base200: string;
  base300: string;
  baseContent: string;
  baseContentLessVisible: string;
  primary: string;
  primaryContent: string;
};

export type KeyColorsKey = keyof KeyColors;

export type ColorKeyOrString = { key: KeyColorsKey } | string;
