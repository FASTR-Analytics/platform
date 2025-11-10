// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function copyHeadersNoneOrArray<T extends "none" | string[]>(
  headers: T,
): T {
  if (headers === "none") {
    return "none" as T;
  }
  return [...headers] as T;
}
