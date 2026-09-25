// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// A driver cell as a JSON cell. Structural, because this module cannot name
// the driver's classes: a bigint within the safe range converts, DECIMAL
// arrives as an object with toDouble, and a non-finite double is null.
export function toLongTableCell(
  value: unknown,
  column: string,
): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    if (
      value > BigInt(Number.MAX_SAFE_INTEGER) ||
      value < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new Error(
        `Column "${column}" holds ${value}, outside the safe integer range`,
      );
    }
    return Number(value);
  }
  if (typeof value === "object" && hasToDouble(value)) {
    const n = value.toDouble();
    return Number.isFinite(n) ? n : null;
  }
  throw new Error(`Column "${column}" holds an unsupported ${describe(value)}`);
}

function hasToDouble(value: object): value is { toDouble: () => number } {
  return typeof (value as { toDouble?: unknown }).toDouble === "function";
}

function describe(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return typeof value;
  }
  return value.constructor?.name ?? "object";
}
