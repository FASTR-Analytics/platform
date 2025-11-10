// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function anyTrue(arr: boolean[]): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === true) {
      return true;
    }
  }
  return false;
}

export function allTrue(arr: boolean[]): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === false) {
      return false;
    }
  }
  return true;
}
