// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function withAnyLabelReplacement<T extends string | string[]>(
  strOrArr: T,
  labelReplacements: Record<string, string> | undefined,
): T {
  if (typeof strOrArr === "string") {
    if (labelReplacements && labelReplacements[strOrArr]) {
      return labelReplacements[strOrArr] as typeof strOrArr;
    }
    return strOrArr;
  }
  return strOrArr.map<string>((str) => {
    if (labelReplacements && labelReplacements[str]) {
      return labelReplacements[str] as string;
    }
    return str;
  }) as typeof strOrArr;
}
