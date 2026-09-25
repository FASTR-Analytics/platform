// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function getFormatterFunc(
  numberOrPercent: "number" | "percent",
  decimalPlaces: number,
  replacementStringForNullOrUndefined?: string,
): (v: number | string | null | undefined) => string {
  switch (decimalPlaces) {
    case 0:
      return numberOrPercent === "number"
        ? (v) => toNum0(v, replacementStringForNullOrUndefined)
        : (v) => toPct0(v, replacementStringForNullOrUndefined);
    case 1:
      return numberOrPercent === "number"
        ? (v) => toNum1(v, replacementStringForNullOrUndefined)
        : (v) => toPct1(v, replacementStringForNullOrUndefined);
    case 2:
      return numberOrPercent === "number"
        ? (v) => toNum2(v, replacementStringForNullOrUndefined)
        : (v) => toPct2(v, replacementStringForNullOrUndefined);
    case 3:
      return numberOrPercent === "number"
        ? (v) => toNum3(v, replacementStringForNullOrUndefined)
        : (v) => toPct3(v, replacementStringForNullOrUndefined);
  }
  throw new Error("Could not get formatter func");
}

// Pct

export function toPct0(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return Math.round(num * 100).toFixed(0) + "%";
}

export function toPct1(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 1000) / 10).toFixed(1) + "%";
}

export function toPct2(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 10000) / 100).toFixed(2) + "%";
}

export function toPct3(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 100000) / 1000).toFixed(3) + "%";
}

// Pct

export function to100Pct0(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return Math.round(num).toFixed(0) + "%";
}

// Num

export function toNum0(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return Math.round(num)
    .toFixed(0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function toNum1(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 10) / 10)
    .toFixed(1)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function toNum2(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 100) / 100)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function toNum3(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return (Math.round(num * 1000) / 1000)
    .toFixed(3)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Auto (strips trailing zeros, max 3 decimals)

export function toNumAuto(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  const rounded = Math.round(num * 1000) / 1000;
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function toPctAuto(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  const rounded = Math.round(num * 100000) / 1000;
  return rounded.toString() + "%";
}

// Abbrev

const ABBREV_UNITS = ["", "K", "M", "B"];

function splitAbbrev(abs: number): { mantissa: number; unitIndex: number } {
  let mantissa = abs;
  let unitIndex = 0;
  while (unitIndex < ABBREV_UNITS.length - 1 && mantissa >= 1000) {
    mantissa = mantissa / 1000;
    unitIndex++;
  }
  return { mantissa, unitIndex };
}

function abbreviateNumber(num: number, decimals: number): string {
  const sign = num < 0 ? "-" : "";
  const split = splitAbbrev(Math.abs(num));
  const factor = Math.pow(10, decimals);
  let mantissa = Math.round(split.mantissa * factor) / factor;
  let unitIndex = split.unitIndex;
  // Rounding can push the mantissa up into the next unit (e.g. 999_999 -> "1M").
  if (mantissa >= 1000 && unitIndex < ABBREV_UNITS.length - 1) {
    mantissa = Math.round((mantissa / 1000) * factor) / factor;
    unitIndex++;
  }
  return sign + mantissa.toFixed(decimals) + ABBREV_UNITS[unitIndex];
}

function exactDecimalPlaces(v: number): number {
  for (let dp = 0; dp < 3; dp++) {
    const factor = Math.pow(10, dp);
    if (Math.abs(Math.round(v * factor) / factor - v) < 1e-9 * Math.max(1, v)) {
      return dp;
    }
  }
  return 3;
}

// Decimals are per value (0 to 3, the fewest that show it exactly), so mixed
// units read "500K, 1M, 1.5M" rather than "500.0K, 1.0M, 1.5M".
export function toAbbrevAuto(v: number): string {
  return abbreviateNumber(
    v,
    exactDecimalPlaces(splitAbbrev(Math.abs(v)).mantissa),
  );
}

function toAbbrevWithDecimals(
  v: number | string | null | undefined,
  decimals: number,
  replacementStringForNullOrUndefined?: string,
): string {
  if (v === null || v === undefined) {
    if (replacementStringForNullOrUndefined) {
      return replacementStringForNullOrUndefined;
    }
    throw new Error("Value is null or undefined");
  }
  const num = Number(v);
  if (isNaN(num)) {
    throw new Error("Value is not a number: " + v);
  }
  return abbreviateNumber(num, decimals);
}

export function toAbbrev0(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  return toAbbrevWithDecimals(v, 0, replacementStringForNullOrUndefined);
}

export function toAbbrev1(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  return toAbbrevWithDecimals(v, 1, replacementStringForNullOrUndefined);
}

export function toAbbrev2(
  v: number | string | null | undefined,
  replacementStringForNullOrUndefined?: string,
): string {
  return toAbbrevWithDecimals(v, 2, replacementStringForNullOrUndefined);
}

export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  const i = Math.max(
    0,
    Math.min(sizes.length - 1, Math.floor(Math.log(abs) / Math.log(k))),
  );

  return sign + parseFloat((abs / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function computeMinDecimalPlaces(values: number[]): number {
  const unique = [...new Set(values)];
  if (unique.length <= 1) return 0;
  for (let dp = 0; dp <= 3; dp++) {
    const factor = Math.pow(10, dp);
    const rounded = new Set(unique.map((v) => Math.round(v * factor)));
    if (rounded.size === unique.length) return dp;
  }
  return 3;
}

export function buildAutoFormatter(
  values: number[],
  format: "number" | "percent",
): (v: number) => string {
  const displayValues = format === "percent"
    ? values.map((v) => v * 100)
    : values;
  const dp = computeMinDecimalPlaces(displayValues);
  const clampedDp = Math.min(dp, 3) as 0 | 1 | 2 | 3;
  return getFormatterFunc(format, clampedDp);
}

export type TickLabelFormatterOption =
  | ((v: number) => string)
  | "auto-number"
  | "auto-percent";
