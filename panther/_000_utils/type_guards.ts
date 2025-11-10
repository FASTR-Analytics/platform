// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function isStringArray(arr: unknown): arr is string[] {
  if (arr instanceof Array) {
    for (const item of arr) {
      if (typeof item !== "string") {
        return false;
      }
    }
    return true;
  }
  return false;
}
