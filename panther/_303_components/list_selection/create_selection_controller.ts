// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
} from "solid-js";

// The one selection helper for the list / nav / selection world. Optional, used
// in app code only — never embedded in a component. Holds ids + selection only;
// it reflects the parent's membership and never owns the data. Replaces the
// former `getTabs` (single) and `createListSelection` (multi).

export type SelectionMode =
  | "single" // 0..1; click selects
  | "single-required" // exactly 1 once items exist; auto-selects first; never empty-while-populated
  | "single-optional" // 0..1; clicking the selected item deselects
  | "multi"; // 0..n; shift/cmd range; batch

export type MoveOp<T extends string> =
  | { id: T; toStart: true }
  | { id: T; toEnd: true }
  | { id: T; before: T }
  | { id: T; after: T };

export type SelectionController<T extends string> = {
  // membership — reflects the parent's id list; never owns the data
  ids: Accessor<T[]>;
  // queries
  isSelected: (id: T) => boolean;
  selectedIds: Accessor<T[]>; // ordered by list order
  selectedId: Accessor<T | undefined>; // first selected (all modes)
  selectedCount: Accessor<number>;
  // commands
  select: (id: T) => void; // single: replace; multi: add
  toggle: (id: T) => void;
  clear: () => void;
  selectAll: () => void; // multi only
  // pointer handling for bespoke markup (multi: shift/cmd range; single: select + optional open)
  handleClick: (id: T, event?: MouseEvent, onOpen?: () => void) => void;
  getBatchIds: (clickedId: T) => T[];
  // pure helper for servers that take positional moves
  computeMove: (oldIds: T[], newIds: T[]) => MoveOp<T> | undefined;
};

export type SelectionControllerOptions<T extends string> = {
  ids: Accessor<T[]>; // reactive membership
  mode?: SelectionMode; // default "single"
  selected?: Accessor<T | T[] | undefined>; // controlled (optional)
  onSelectionChange?: (ids: T[]) => void;
};

function toArray<T extends string>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function createSelectionController<T extends string>(
  o: SelectionControllerOptions<T>,
): SelectionController<T> {
  const mode = o.mode ?? "single";
  const isMulti = mode === "multi";
  const controlled = o.selected !== undefined;

  const [internal, setInternal] = createSignal<T[]>([]);
  const [lastIndex, setLastIndex] = createSignal<number | null>(null);

  // Selection, pruned to current ids() and ordered by list order.
  const selectedIds = createMemo<T[]>(() => {
    const raw = controlled ? toArray(o.selected!()) : internal();
    const wanted = new Set(raw);
    return o.ids().filter((id) => wanted.has(id));
  });

  function commit(next: readonly T[]) {
    const wanted = new Set(next);
    const ordered = o.ids().filter((id) => wanted.has(id));
    if (!controlled) setInternal(ordered);
    o.onSelectionChange?.(ordered);
  }

  const isSelected = (id: T) => selectedIds().includes(id);
  const selectedId = createMemo(() => selectedIds()[0]);
  const selectedCount = createMemo(() => selectedIds().length);

  function select(id: T) {
    if (isMulti) {
      if (isSelected(id)) return;
      commit([...selectedIds(), id]);
    } else {
      commit([id]);
    }
  }

  function toggle(id: T) {
    if (isSelected(id)) {
      commit(selectedIds().filter((x) => x !== id));
    } else if (isMulti) {
      commit([...selectedIds(), id]);
    } else {
      commit([id]);
    }
  }

  function clear() {
    setLastIndex(null);
    commit([]);
  }

  function selectAll() {
    if (!isMulti) return;
    commit([...o.ids()]);
  }

  function getBatchIds(clickedId: T): T[] {
    const sel = selectedIds();
    if (sel.includes(clickedId) && sel.length > 1) return sel;
    return [clickedId];
  }

  function selectRange(toIndex: number) {
    const last = lastIndex();
    if (last === null || toIndex < 0) return;
    const ids = o.ids();
    const range = ids.slice(
      Math.min(last, toIndex),
      Math.max(last, toIndex) + 1,
    );
    commit([...selectedIds(), ...range]);
  }

  // Mirrors the proven `createListSelection` pointer semantics: with `onOpen`
  // it behaves like a card body click (modifiers modify, plain opens); without
  // it, like a selection circle (plain toggles this id).
  function handleClick(id: T, event?: MouseEvent, onOpen?: () => void) {
    const index = o.ids().indexOf(id);

    if (!isMulti) {
      if (mode === "single-optional" && isSelected(id)) {
        commit([]);
      } else {
        commit([id]);
      }
      setLastIndex(index);
      onOpen?.();
      return;
    }

    if (event?.metaKey || event?.ctrlKey) {
      toggle(id);
      setLastIndex(index);
      return;
    }
    if (event?.shiftKey && lastIndex() !== null) {
      event.preventDefault();
      selectRange(index);
      return;
    }
    if (onOpen) {
      clear();
      onOpen();
      return;
    }
    if (isSelected(id)) {
      commit(selectedIds().filter((x) => x !== id));
    } else {
      commit([id]);
    }
    setLastIndex(index);
  }

  function computeMove(oldIds: T[], newIds: T[]): MoveOp<T> | undefined {
    if (newIds.length !== oldIds.length) return undefined;
    if (newIds.every((id, i) => id === oldIds[i])) return undefined;
    for (let i = 0; i < newIds.length; i++) {
      if (newIds[i] !== oldIds[i]) {
        const movedId = newIds[i];
        return i === 0 ? { id: movedId, toStart: true } : {
          id: movedId,
          after: newIds[i - 1],
        };
      }
    }
    return undefined;
  }

  // single-required: keep exactly one selected once items exist; prune to none
  // (no throw) when empty. Replaces the hand-rolled auto-select-first effects.
  if (mode === "single-required") {
    createEffect(() => {
      const ids = o.ids();
      if (ids.length > 0 && selectedIds().length === 0) {
        commit([ids[0]]);
      }
    });
  }

  return {
    ids: o.ids,
    isSelected,
    selectedIds,
    selectedId,
    selectedCount,
    select,
    toggle,
    clear,
    selectAll,
    handleClick,
    getBatchIds,
    computeMove,
  };
}
