// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { capitalizeFirstLetter } from "../deps.ts";
import type { SelectOption } from "./types.ts";

export function getSelectOptions(arr: string[]): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v, label: v };
  });
}

export function getSelectOptionsWithLabelReplacement<T extends string>(
  arr: T[],
  labelReplacements: { [key: string]: string },
): SelectOption<T>[] {
  return arr.map((v) => {
    return { value: v, label: labelReplacements[v] ?? v };
  });
}

export function getSelectOptionsWithFirstCapital(
  arr: string[],
): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v, label: capitalizeFirstLetter(v) };
  });
}

export function getSelectOptionsFromIdLabel(
  arr: { id: string; label: string }[],
): SelectOption<string>[] {
  return arr.map((v) => {
    return { value: v.id, label: v.label };
  });
}

export function useAutoFocus(el: HTMLElement, shouldFocus?: boolean) {
  if (shouldFocus) {
    setTimeout(() => el.focus());
  }
}
