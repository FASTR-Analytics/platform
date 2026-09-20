// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SelectOption } from "./types.ts";

export function getSelectOptions(arr: string[]): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v, label: v };
  });
}

export function getSelectOptionsFromIdLabel(
  arr: { id: string; label: string }[],
): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v.id, label: v.label };
  });
}
