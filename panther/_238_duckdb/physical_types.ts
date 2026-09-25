// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DescribedColumn, LongTableColumnType } from "./deps.ts";

const INTEGER_TYPES = new Set([
  "TINYINT",
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "UTINYINT",
  "USMALLINT",
  "UINTEGER",
  "UBIGINT",
]);

export function normalizeDuckDbType(rawType: string): DescribedColumn["type"] {
  const upper = rawType.toUpperCase();
  if (INTEGER_TYPES.has(upper)) {
    return "integer";
  }
  if (
    upper === "FLOAT" || upper === "DOUBLE" || upper === "REAL" ||
    upper.startsWith("DECIMAL")
  ) {
    return "number";
  }
  if (upper === "VARCHAR") {
    return "text";
  }
  if (upper === "BOOLEAN") {
    return "boolean";
  }
  if (upper === "DATE") {
    return "date";
  }
  if (upper.startsWith("TIMESTAMP")) {
    return "timestamp";
  }
  return "unsupported";
}

// Whether a physical column may back a declared type. A HUGEINT is never an
// integer here: a cell may not fit a safe integer.
export function isCompatibleType(
  declared: LongTableColumnType,
  rawType: string,
): boolean {
  const normalized = normalizeDuckDbType(rawType);
  if (declared === "integer") {
    return normalized === "integer";
  }
  if (declared === "number") {
    return normalized === "integer" || normalized === "number";
  }
  return normalized === "text";
}

export function isIntegerFamily(rawType: string): boolean {
  return normalizeDuckDbType(rawType) === "integer";
}
