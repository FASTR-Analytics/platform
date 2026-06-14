// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function createArray(n: number): number[];
export function createArray<T>(
  n: number,
  valOrValFunc: T | ((i: number) => T),
): T[];
export function createArray<T>(
  n: number,
  valOrValFunc?: T | ((i: number) => T),
) {
  if (valOrValFunc === undefined) {
    return new Array(n).fill(0).map((_, i) => i);
  }
  if (typeof valOrValFunc === "function") {
    const func = valOrValFunc as (i: number) => T;
    return new Array(n).fill(0).map((_, i) => func(i));
  }
  if (typeof valOrValFunc === "object" && valOrValFunc !== null) {
    return new Array(n).fill(0).map(() => structuredClone(valOrValFunc));
  }
  // Primitives (string, number, boolean, bigint, symbol, null) fill directly.
  return new Array(n).fill(0).map(() => valOrValFunc);
}
