// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  isListItem,
  type ListEntry,
  type ListItem,
} from "../../list_selection/list_item_types.ts";

export const ALL_LISTBOX_NAV_KEYS = [
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
] as const;

export type ListboxNavKey = (typeof ALL_LISTBOX_NAV_KEYS)[number];

export function isListboxNavKey(key: string): key is ListboxNavKey {
  return (ALL_LISTBOX_NAV_KEYS as readonly string[]).includes(key);
}

export function getActivatableIndices<T extends string, M>(
  entries: ListEntry<T, M>[],
): number[] {
  return entries.flatMap((entry, i) =>
    isListItem(entry) && !entry.disabled ? [i] : []
  );
}

// No wrapping at either end, as the native listbox: an arrow past the last
// activatable row stays put.
export function getNextActiveIndex<T extends string, M>(
  entries: ListEntry<T, M>[],
  current: number | undefined,
  key: ListboxNavKey,
): number | undefined {
  const activatable = getActivatableIndices(entries);
  if (activatable.length === 0) {
    return undefined;
  }
  const first = activatable[0];
  const last = activatable[activatable.length - 1];
  switch (key) {
    case "Home":
      return first;
    case "End":
      return last;
    case "ArrowDown": {
      if (current === undefined) {
        return first;
      }
      return activatable.find((i) => i > current) ?? current;
    }
    case "ArrowUp": {
      if (current === undefined) {
        return last;
      }
      return activatable.findLast((i) => i < current) ?? current;
    }
  }
}

// The search starts after the active row and wraps once, ending on the active
// row itself, so a longer buffer can land back where it started. A buffer of
// one letter repeated is matched as that letter, so repeated presses cycle
// through the rows starting with it instead of looking for "aa", as the
// native control does. No match leaves the active row where it is.
export function getTypeAheadIndex<T extends string, M>(
  entries: ListEntry<T, M>[],
  current: number | undefined,
  buffer: string,
): number | undefined {
  const needle = collapseRepeatedLetter(buffer).toLowerCase();
  if (needle.length === 0) {
    return current;
  }
  const activatable = getActivatableIndices(entries);
  const start = current === undefined ? -1 : current;
  const after = activatable.filter((i) => i > start);
  const upToCurrent = activatable.filter((i) => i <= start);
  const match = [...after, ...upToCurrent].find((i) => {
    const entry = entries[i];
    return isListItem(entry) &&
      getListItemText(entry).toLowerCase().startsWith(needle);
  });
  return match ?? current;
}

// The text a row is matched and announced by: the string label, else the
// labelText a JSX label carries, else the id.
export function getListItemText<T extends string, M>(
  item: ListItem<T, M>,
): string {
  return typeof item.label === "string"
    ? item.label
    : item.labelText ?? item.id;
}

function collapseRepeatedLetter(buffer: string): string {
  const chars = [...buffer];
  return chars.length > 1 && chars.every((c) => c === chars[0])
    ? chars[0]
    : buffer;
}
