// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { Button } from "./button.tsx";
import SortableVendor from "./solid_sortablejs_vendored.tsx";

export function TimSortableGrid<T extends { id: string }>(p: {
  tempIdsInOrder: T[];
  setTempIdsInOrder: SetStoreFunction<T[]>;
  children: (item: T, index: number) => JSX.Element;
}) {
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = createSignal<number | null>(
    null,
  );
  const [showSortable, setShowSortable] = createSignal(true);

  const handleItemClick = (index: number, event: MouseEvent) => {
    // Only handle Shift+Click for range selection
    // Let SortableJS handle Cmd/Ctrl+Click and normal clicks
    if (event.shiftKey && lastSelectedIndex() !== null) {
      event.preventDefault(); // Prevent SortableJS from handling this one

      const currentSelected = selectedIds();
      const newSelected = new Set(currentSelected);

      const start = Math.min(lastSelectedIndex()!, index);
      const end = Math.max(lastSelectedIndex()!, index);

      for (let i = start; i <= end; i++) {
        newSelected.add(p.tempIdsInOrder[i].id);
      }

      setSelectedIds(newSelected);
    } else if (!event.ctrlKey && !event.metaKey) {
      // For regular clicks (no modifiers), just track the index
      setLastSelectedIndex(index);
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set<string>());
    setLastSelectedIndex(null);
  };

  function handleRemoveSelected() {
    const idsToRemove = selectedIds();

    // Hide sortable to clear its internal state
    setShowSortable(false);

    // Remove items from the array
    p.setTempIdsInOrder(
      p.tempIdsInOrder.filter((item) => !idsToRemove.has(item.id)),
    );

    // Clear our selection state
    setSelectedIds(new Set<string>());
    setLastSelectedIndex(null);

    // Show sortable again after a microtask
    queueMicrotask(() => setShowSortable(true));
  }

  return (
    <div class="ui-spy ui-pad h-full w-full overflow-auto">
      {
        /* <Button intent="base-100">
          {selectedIds().size} {"selected"}
        </Button> */
      }
      <Show when={selectedIds().size > 0}>
        {(_) => (
          <div class="ui-gap-sm flex items-center">
            <Button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRemoveSelected();
              }}
              intent="danger"
              // iconName="trash"
              outline
            >
              {"Remove"}
            </Button>
            <Button onClick={handleClearSelection} outline intent="neutral">
              {"Clear selection"}
            </Button>
          </div>
        )}
      </Show>
      <div class="w-full">
        <Show when={showSortable()} keyed>
          {(_) => {
            return (
              <SortableVendor
                idField="id"
                items={p.tempIdsInOrder}
                setItems={p.setTempIdsInOrder}
                animation={150}
                ghostClass="opacity-50"
                chosenClass="shadow-2xl"
                dragClass="cursor-grabbing"
                class="sortable-grid ui-gap-sm flex flex-wrap"
                multiDrag
                multiDragKey="META"
                selectedClass="sortable-selected"
                fallbackTolerance={3}
                onSelect={(evt: any) => {
                  const itemId = evt.item.dataset.id;
                  if (itemId && !selectedIds().has(itemId)) {
                    setSelectedIds(new Set([...selectedIds(), itemId]));
                  }
                }}
                onDeselect={(evt: any) => {
                  const itemId = evt.item.dataset.id;
                  if (itemId && selectedIds().has(itemId)) {
                    const newSet = new Set(selectedIds());
                    newSet.delete(itemId);
                    setSelectedIds(newSet);
                  }
                }}
              >
                {(item: T) => {
                  const itemIndex = p.tempIdsInOrder.findIndex(
                    (i) => i.id === item.id,
                  );
                  const isSelected = () => selectedIds().has(item.id);

                  return (
                    <div
                      class="relative w-36 cursor-pointer overflow-hidden rounded-lg border-2 transition-all hover:shadow-lg"
                      classList={{
                        "border-base-300": !isSelected(),
                        "border-primary ring-2 ring-primary/30": isSelected(),
                        "hover:border-primary": !isSelected(),
                        "sortable-selected": isSelected(),
                      }}
                      onClick={(e) => handleItemClick(itemIndex, e)}
                      data-selected={isSelected()}
                    >
                      {isSelected() && (
                        <div class="bg-primary text-primary-content absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full">
                          <svg
                            class="h-4 w-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fill-rule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clip-rule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                      {p.children(item, itemIndex)}
                    </div>
                  );
                }}
              </SortableVendor>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
