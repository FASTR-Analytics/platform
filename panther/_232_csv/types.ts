// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv } from "./deps.ts";

// ================================================================================
// CSV OPTIONS
// ================================================================================

export interface CsvReadOptions {
  colHeaders?: "none" | "use-first-row" | undefined;
  rowHeaders?: "none" | "use-first-col" | undefined;
}

export interface XlsxReadOptions extends CsvReadOptions {
  sheetIndexToTake?: number;
  sheetNameToTake?: string;
}

export interface XlsxWriteOptions {
  colHeaderForNewFirstCol?: string;
}

// ================================================================================
// TYPE GUARDS
// ================================================================================

export function isCsvData(value: unknown): value is Csv<unknown> {
  return value instanceof Csv;
}

// ================================================================================
// UTILITY TYPES
// ================================================================================

export type RequireProps<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };
