// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}

export function sumWith<T>(arr: T[], func: (v: T) => number): number {
  return arr.reduce((prev: number, v: T) => prev + func(v), 0);
}

export function avg(arr: number[]): number {
  if (arr.length === 0) {
    return 0;
  }
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function sumStringsIntoString(
  arr: string[],
  toFixedDigits?: number,
): string {
  const summed = arr.reduce((s, v) => {
    const num = Number(v);
    if (isNaN(num)) {
      console.log(arr);
      throw new Error("Cannot read cell as number. Cell is NaN.");
    }
    return s + num;
  }, 0);
  if (toFixedDigits === undefined) {
    return String(summed);
  }
  return summed.toFixed(toFixedDigits);
}

export function avgStringsIntoString(
  arr: string[],
  toFixedDigits?: number,
): string {
  const avged = arr.length === 0 ? 0 : arr.reduce((s, v) => {
    const num = Number(v);
    if (isNaN(num)) {
      console.log(arr);
      throw new Error("Cannot read cell as number. Cell is NaN.");
    }
    return s + num;
  }, 0) / arr.length;

  if (toFixedDigits === undefined) {
    return String(avged);
  }
  return avged.toFixed(toFixedDigits);
}
