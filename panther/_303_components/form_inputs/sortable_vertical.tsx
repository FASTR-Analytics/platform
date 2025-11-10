// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import SortableVendor from "./solid_sortablejs_vendored.tsx";
import { GripVerticalIcon } from "../icons/icons.tsx";

export function TimSortableVertical<T extends { id: string }>(p: {
  items: T[];
  setItems: SetStoreFunction<T[]>;
  children: (item: T, index: number) => JSX.Element;
  showHandle?: boolean;
  handlePosition?: "left" | "right";
}) {
  const showHandleValue = () => p.showHandle ?? true;
  const handlePos = () => p.handlePosition ?? "left";

  return (
    <div class="ui-spy-sm w-full">
      <SortableVendor
        idField="id"
        items={p.items}
        setItems={p.setItems}
        animation={150}
        ghostClass="opacity-50"
        chosenClass="shadow-2xl"
        dragClass="cursor-grabbing"
        fallbackTolerance={3}
        handle={showHandleValue() ? ".drag-handle" : undefined}
        class="ui-spy-sm"
      >
        {(item: T) => {
          const itemIndex = p.items.findIndex((i) => i.id === item.id);

          return (
            <div
              class="flex items-center gap-2"
              classList={{
                "cursor-grab": !showHandleValue(),
                "active:cursor-grabbing": !showHandleValue(),
              }}
            >
              <Show when={showHandleValue() && handlePos() === "left"}>
                <div class="drag-handle text-neutral flex h-4 w-4 shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVerticalIcon />
                </div>
              </Show>

              <div class="flex-1">{p.children(item, itemIndex)}</div>

              <Show when={showHandleValue() && handlePos() === "right"}>
                <div class="drag-handle text-neutral flex h-4 w-4 shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVerticalIcon />
                </div>
              </Show>
            </div>
          );
        }}
      </SortableVendor>
    </div>
  );
}
