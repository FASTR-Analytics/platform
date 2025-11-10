// Copyright 2023-2025, Tim Roberton, All rights reserved.
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
  if (typeof valOrValFunc === "string") {
    return new Array(n).fill(0).map(() => valOrValFunc);
  }
  if (typeof valOrValFunc === "number") {
    return new Array(n).fill(0).map(() => valOrValFunc);
  }
  if (typeof valOrValFunc === "function") {
    const func = valOrValFunc as (i: number) => T;
    return new Array(n).fill(0).map((_, i) => func(i));
  }
  if (typeof valOrValFunc === "object") {
    return new Array(n).fill(0).map(() => structuredClone(valOrValFunc));
  }
  throw new Error("Should not happen");
}
