// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function tryCatch<T>(func: () => T, msg?: string): T {
  try {
    return func();
  } catch {
    console.log("%c" + (msg ?? "Did not pass try-catch"), "color: red");
    throw new Error(msg ?? "Did not pass try-catch");
  }
}
