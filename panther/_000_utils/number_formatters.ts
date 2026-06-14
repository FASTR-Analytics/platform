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

function abbreviateNumber(num: number, decimals: number): string {
  const sign = num < 0 ? "-" : "";
  let abs = Math.abs(num);
  const units = ["K", "M", "B"];
  let unitIndex = -1;
  while (unitIndex < units.length - 1 && abs >= 1000) {
    abs = abs / 1000;
    unitIndex++;
  }
  if (unitIndex === -1) {
    return sign + Math.round(abs).toFixed(0);
  }
  const factor = Math.pow(10, decimals);
  let mantissa = Math.round(abs * factor) / factor;
  // Rounding can push the mantissa up into the next unit (e.g. 999_999 -> "1M").
  if (mantissa >= 1000 && unitIndex < units.length - 1) {
    mantissa = Math.round((mantissa / 1000) * factor) / factor;
    unitIndex++;
  }
  return sign + mantissa.toFixed(decimals) + units[unitIndex];
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
