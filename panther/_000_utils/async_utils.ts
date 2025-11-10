// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export async function asyncForEach<T>(
  arr: T[],
  func: (t: T, i: number, arr: T[]) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < arr.length; i++) {
    await func(arr[i], i, arr);
  }
}

export async function asyncMap<T, R>(
  arr: T[],
  func: (t: T, i: number, arr: T[]) => Promise<R>,
): Promise<R[]> {
  const output: R[] = [];
  for (let i = 0; i < arr.length; i++) {
    output.push(await func(arr[i], i, arr));
  }
  return output;
}
