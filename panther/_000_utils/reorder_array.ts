// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { clamp } from "./numbers.ts";

export function getWithMovedElement<T>(
  arr: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex < 0 || fromIndex >= arr.length) {
    throw new Error("Bad fromIndex in moving array");
  }
  if (toIndex < 0 || toIndex >= arr.length) {
    throw new Error("Bad toIndex in moving array");
  }
  const movedElement = arr[fromIndex];
  return arr.toSpliced(fromIndex, 1).toSpliced(toIndex, 0, movedElement);
}

export function getWithElementMovedToPrev<T>(arr: T[], elIndex: number): T[] {
  if (elIndex < 0 || elIndex >= arr.length) {
    return [...arr];
  }
  const toIndex = clamp(elIndex - 1, 0, arr.length - 1);
  return getWithMovedElement(arr, elIndex, toIndex);
}

export function getWithElementMovedToNext<T>(arr: T[], elIndex: number): T[] {
  if (elIndex < 0 || elIndex >= arr.length) {
    return [...arr];
  }
  const toIndex = clamp(elIndex + 1, 0, arr.length - 1);
  return getWithMovedElement(arr, elIndex, toIndex);
}
