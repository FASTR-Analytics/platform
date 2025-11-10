// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function round(
  val: number,
  precision: -3 | -2 | -1 | 0 | 1 | 2 | 3,
): number {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(val * multiplier) / multiplier;
}

export function getValidNumberOrThrowError(val: unknown): number {
  if (val === undefined) {
    throw new Error("Cannot read cell as number. Cell is undefined.");
  }
  if (val === null) {
    throw new Error("Cannot read cell as number. Cell is null.");
  }
  if (typeof val === "string" && val.trim() === "") {
    throw new Error("Cannot read cell as number. Cell is an empty string.");
  }
  const num = Number(val);
  if (isNaN(num)) {
    throw new Error("Cannot read cell as number. Cell is NaN. " + val);
  }
  return num;
}

export function getValidNumberOrZero(val: string | number): number {
  if (typeof val === "string" && val.trim() === "") {
    return 0;
  }
  const num = Number(val);
  if (isNaN(num)) {
    return 0;
  }
  return num;
}

export function getValidNumberOrUndefined(val: unknown): number | undefined {
  if (val === undefined) {
    return undefined;
  }
  if (val === null) {
    return undefined;
  }
  if (typeof val === "string" && val.trim() === "") {
    return undefined;
  }
  const num = Number(val);
  if (isNaN(num)) {
    return undefined;
  }
  return num;
}

export function divideOrZero(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  const val = numerator / denominator;
  if (isNaN(val)) {
    throw new Error("Value is NaN");
  }
  return val;
}
