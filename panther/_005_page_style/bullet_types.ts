// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type BulletLevelStyle = {
  marker: string;
  markerIndent: number;
  textIndent: number;
  topGapToPreviousBullet: number;
};

export type BulletLevelStyleOptions = {
  marker?: string;
  markerIndent?: number;
  textIndent?: number;
  topGapToPreviousBullet?: number;
};

// Note: Using characters that are widely supported across fonts
// "◦" (U+25E6) is not in many fonts, so using "–" (en dash) instead
export const DEFAULT_BULLET_MARKERS = ["•", "–", "·"] as const;
