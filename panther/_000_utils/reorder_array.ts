// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

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
  const toIndex = Math.min(arr.length - 1, Math.max(0, elIndex - 1));
  return getWithMovedElement(arr, elIndex, toIndex);
}

export function getWithElementMovedToNext<T>(arr: T[], elIndex: number): T[] {
  if (elIndex < 0 || elIndex >= arr.length) {
    return [...arr];
  }
  const toIndex = Math.min(arr.length - 1, Math.max(0, elIndex + 1));
  return getWithMovedElement(arr, elIndex, toIndex);
}
