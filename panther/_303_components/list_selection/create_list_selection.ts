// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, createSignal } from "solid-js";

export type ListSelectionOptions<TId extends string> = {
  onSelectionChange?: (selectedIds: TId[]) => void;
};

export type ListSelectionReturn<TId extends string> = {
  selectedIds: Accessor<Set<TId>>;
  isSelected: (id: TId) => boolean;
  selectedCount: Accessor<number>;
  clearSelection: () => void;
  selectOnly: (id: TId) => void;
  selectAll: (ids: TId[]) => void;
  toggleSelection: (id: TId) => void;
  setItems: (ids: TId[]) => void;
  getBatchIds: (clickedId: TId) => TId[];
  handleCircleClick: (index: number, id: TId, event: MouseEvent) => void;
  handleCardClick: (
    index: number,
    id: TId,
    event: MouseEvent,
    onOpen: () => void,
  ) => void;
};

export function createListSelection<TId extends string>(
  options?: ListSelectionOptions<TId>,
): ListSelectionReturn<TId> {
  const [selectedIds, setSelectedIds] = createSignal<Set<TId>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(
    null,
  );
  const [items, setItemsInternal] = createSignal<TId[]>([]);

  function updateSelection(newSelected: Set<TId>) {
    setSelectedIds(newSelected);
    options?.onSelectionChange?.(Array.from(newSelected));
  }

  function clearSelection() {
    setSelectedIds(new Set<TId>());
    setLastSelectedIndex(null);
    options?.onSelectionChange?.([]);
  }

  function selectOnly(id: TId) {
    updateSelection(new Set([id]));
  }

  function selectAll(ids: TId[]) {
    updateSelection(new Set(ids));
  }

  function toggleSelection(id: TId) {
    const newSelected = new Set(selectedIds());
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    updateSelection(newSelected);
  }

  function setItems(ids: TId[]) {
    setItemsInternal(ids);
    const currentSelected = selectedIds();
    if (currentSelected.size === 0) return;
    const validIds = new Set(ids);
    const pruned = new Set<TId>();
    for (const id of currentSelected) {
      if (validIds.has(id)) {
        pruned.add(id);
      }
    }
    if (pruned.size !== currentSelected.size) {
      updateSelection(pruned);
    }
  }

  function getBatchIds(clickedId: TId): TId[] {
    const selected = selectedIds();
    if (selected.has(clickedId) && selected.size > 1) {
      return Array.from(selected);
    }
    return [clickedId];
  }

  function handleRangeSelect(index: number) {
    const last = lastSelectedIndex();
    if (last === null) return false;

    const itemList = items();
    if (itemList.length === 0) {
      return false;
    }

    const start = Math.min(last, index);
    const end = Math.max(last, index);
    const newSelected = new Set(selectedIds());

    for (let i = start; i <= end; i++) {
      const id = itemList[i];
      if (id !== undefined) {
        newSelected.add(id);
      }
    }
    updateSelection(newSelected);
    return true;
  }

  function handleCircleClick(index: number, id: TId, event: MouseEvent) {
    event.stopPropagation();

    if (event.metaKey || event.ctrlKey) {
      toggleSelection(id);
      setLastSelectedIndex(index);
      return;
    }

    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      if (handleRangeSelect(index)) return;
    }

    const currentlySelected = selectedIds();
    if (currentlySelected.has(id)) {
      const newSelected = new Set(currentlySelected);
      newSelected.delete(id);
      updateSelection(newSelected);
    } else {
      selectOnly(id);
    }
    setLastSelectedIndex(index);
  }

  function handleCardClick(
    index: number,
    id: TId,
    event: MouseEvent,
    onOpen: () => void,
  ) {
    if (event.metaKey || event.ctrlKey) {
      toggleSelection(id);
      setLastSelectedIndex(index);
      return;
    }

    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault();
      if (handleRangeSelect(index)) return;
    }

    clearSelection();
    onOpen();
  }

  return {
    selectedIds,
    isSelected: (id: TId) => selectedIds().has(id),
    selectedCount: () => selectedIds().size,
    clearSelection,
    selectOnly,
    selectAll,
    toggleSelection,
    setItems,
    getBatchIds,
    handleCircleClick,
    handleCardClick,
  };
}
