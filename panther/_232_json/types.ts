// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// ================================================================================
// TYPE GUARDS
// ================================================================================

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ================================================================================
// UTILITY TYPES
// ================================================================================

export type RequireProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
