// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function getSortedAlphabetical(arr: string[]): string[] {
  const newArr = [...arr];
  sortAlphabetical(newArr);
  return newArr;
}

export function sortAlphabetical(arr: string[]): void {
  arr.sort(sortFuncAlphabetical);
}

export function sortFuncAlphabetical(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" });
}

export function sortFuncAlphabeticalReverse(a: string, b: string): number {
  return b.trim().localeCompare(a.trim(), undefined, { sensitivity: "base" });
}

// ================================================================================
// BY FUNC
// ================================================================================

export function getSortedAlphabeticalByFunc<T>(
  arr: T[],
  byFunc: (v: T) => string,
): T[] {
  const newArr = [...arr];
  sortAlphabeticalByFunc(newArr, byFunc);
  return newArr;
}

export function sortAlphabeticalByFunc<T>(
  arr: T[],
  byFunc: (v: T) => string,
): void {
  arr.sort((a, b) => {
    return byFunc(a)
      .trim()
      .localeCompare(byFunc(b).trim(), undefined, { sensitivity: "base" });
  });
}

// ================================================================================
// NUMERIC
// ================================================================================

export function getSortedNumeric(arr: number[]): number[] {
  const newArr = [...arr];
  sortNumeric(newArr);
  return newArr;
}

export function sortNumeric(arr: number[]): void {
  arr.sort(sortFuncNumeric);
}

export function sortFuncNumeric(a: number, b: number): number {
  return a - b;
}

export function sortFuncNumericReverse(a: number, b: number): number {
  return b - a;
}

export function getSortedNumericByFunc<T>(
  arr: T[],
  byFunc: (v: T) => number,
): T[] {
  const newArr = [...arr];
  sortNumericByFunc(newArr, byFunc);
  return newArr;
}

export function sortNumericByFunc<T>(arr: T[], byFunc: (v: T) => number): void {
  arr.sort((a, b) => byFunc(a) - byFunc(b));
}

// ================================================================================
// MULTIPLE CRITERIA
// ================================================================================

export type SortCriteria<T> = {
  key: (item: T) => string | number;
  reverse?: boolean;
};

export function sortByMultipleCriteria<T>(
  arr: T[],
  criteria: SortCriteria<T>[],
): void {
  arr.sort((a, b) => {
    for (const criterion of criteria) {
      const aVal = criterion.key(a);
      const bVal = criterion.key(b);

      let comparison: number;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal
          .trim()
          .localeCompare(bVal.trim(), undefined, { sensitivity: "base" });
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        // Type mismatch - convert to strings for comparison
        comparison = String(aVal).localeCompare(String(bVal));
      }

      if (comparison !== 0) {
        return criterion.reverse ? -comparison : comparison;
      }
    }
    return 0;
  });
}

export function getSortedByMultipleCriteria<T>(
  arr: T[],
  criteria: SortCriteria<T>[],
): T[] {
  const newArr = [...arr];
  sortByMultipleCriteria(newArr, criteria);
  return newArr;
}
