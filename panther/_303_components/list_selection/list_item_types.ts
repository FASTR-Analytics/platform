// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import type { IconName } from "../icons/mod.ts";
import type { Intent } from "../types.ts";
import type { SelectOption } from "../form_inputs/types.ts";

// The one item type for the list / nav / selection / edit family.
// Distinct from form-field `SelectOption<T>` ({value,label}); `id` is the stable
// key AND the change payload. `meta` defaults to `never` so accessing it without
// threading an `M` is a compile error rather than a silent cast.
export type ListItem<T extends string, M = never> = {
  id: T;
  label: string | JSX.Element;
  // tooltip/aria text when `label` is JSX (required when label is JSX and the
  // item can render collapsed, e.g. vertical tabs).
  labelText?: string;
  sublabel?: string | JSX.Element;
  iconName?: IconName;
  dot?: Intent;
  badge?: string | number;
  intent?: Intent;
  disabled?: boolean;
  meta?: M;
  // NOTE: `isGroupHeader` (reorderable group rows) is intentionally DEFERRED —
  // its only consumer (marker) is out of scope. Additive later. See PLAN §4.
};

// Static, non-interactive structure (SelectList divider/header parity).
export type ListEntry<T extends string, M = never> =
  | ListItem<T, M>
  | { divider: true }
  | { header: string };

export function isListItem<T extends string, M>(
  e: ListEntry<T, M>,
): e is ListItem<T, M> {
  return "id" in e;
}

// Bridge a form-field option into the list world.
export function selectOptionToListItem<T extends string>(
  o: SelectOption<T>,
): ListItem<T> {
  return { id: o.value, label: o.label };
}
