// Copyright 2023-2025, Tim Roberton, All rights reserved.
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

// Abbrev

export function toAbbrev0(
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

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs >= 1e9) {
    return sign + Math.round(abs / 1e9).toFixed(0) + "B";
  }
  if (abs >= 1e6) {
    return sign + Math.round(abs / 1e6).toFixed(0) + "M";
  }
  if (abs >= 1e3) {
    return sign + Math.round(abs / 1e3).toFixed(0) + "K";
  }
  return sign + Math.round(abs).toFixed(0);
}

export function toAbbrev1(
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

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs >= 1e9) {
    return sign + (Math.round((abs / 1e9) * 10) / 10).toFixed(1) + "B";
  }
  if (abs >= 1e6) {
    return sign + (Math.round((abs / 1e6) * 10) / 10).toFixed(1) + "M";
  }
  if (abs >= 1e3) {
    return sign + (Math.round((abs / 1e3) * 10) / 10).toFixed(1) + "K";
  }
  return sign + Math.round(abs).toFixed(0);
}

export function toAbbrev2(
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

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs >= 1e9) {
    return sign + (Math.round((abs / 1e9) * 100) / 100).toFixed(2) + "B";
  }
  if (abs >= 1e6) {
    return sign + (Math.round((abs / 1e6) * 100) / 100).toFixed(2) + "M";
  }
  if (abs >= 1e3) {
    return sign + (Math.round((abs / 1e3) * 100) / 100).toFixed(2) + "K";
  }
  return sign + Math.round(abs).toFixed(0);
}

/**
 * Format bytes into human readable string
 * This is a value-add utility not provided by Deno
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
