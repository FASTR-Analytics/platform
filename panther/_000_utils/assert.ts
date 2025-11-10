// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function assert(test: boolean, msg?: string): void {
  if (!test) {
    throw new Error(msg ?? "Did not pass assertion test");
  }
}

export function assertArray<T>(a: unknown, msg?: string): asserts a is T[] {
  if (!(a instanceof Array)) {
    throw new Error(msg ?? "Not an instance of an array");
  }
}

export function assertNumberBetween0And1(
  a: unknown,
  msg?: string,
): asserts a is number {
  if (typeof a !== "number" || isNaN(a) || a < 0 || a > 1) {
    throw new Error(msg ?? "Not an number between 0 and 1");
  }
}

export function assertNotUndefined<T>(
  a: T | undefined | null,
  msg?: string,
): asserts a is T {
  if (a === undefined) {
    throw new Error(msg ?? "Item is undefined");
  }
  if (a === null) {
    throw new Error(msg ?? "Item is null");
  }
}

export function assertTwoArraysAreSameAndInSameOrder<T>(
  a: T[],
  b: T[],
  msg?: string,
): void {
  if (a.length !== b.length) {
    throw new Error(msg ?? "Arrays are not the same length");
  }
  a.forEach((aItem, i_aItem) => {
    if (b[i_aItem] !== aItem) {
      throw new Error(msg ?? "Arrays not the same");
    }
  });
}

export function assertUnique(arr: number[] | string[], msg?: string): void {
  if (arr.length === 0) {
    return;
  }
  if (typeof arr[0] === "number") {
    for (let i = 0; i < arr.length; i++) {
      if ((arr as number[]).indexOf(arr[i] as number) !== i) {
        throw new Error(msg ?? "Array is not unique");
      }
    }
    return;
  }
  if (typeof arr[0] === "string") {
    for (let i = 0; i < arr.length; i++) {
      if ((arr as string[]).indexOf(arr[i] as string) !== i) {
        throw new Error(msg ?? "Array is not unique");
      }
    }
    return;
  }
  throw new Error("Must be string array or number array");
}
