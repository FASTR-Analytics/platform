// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import { GripVerticalIcon } from "../icons/icons.tsx";
import { Reorderable } from "./_internal/reorderable.tsx";

// The bare reorder primitive (formerly TimSortableVertical): a drag-reorder list
// with a grip handle, for custom row content. Delegates drag to the hardened
// `Reorderable` engine and emits `onReorder(orderedIds)`. Use `EditableList` when
// you also want selection / add / delete / list chrome.
export function SortableList<T extends { id: string }>(p: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  children: (item: T, index: number) => JSX.Element;
  showHandle?: boolean;
  handlePosition?: "left" | "right";
}) {
  const showHandle = () => p.showHandle ?? true;
  const handlePos = () => p.handlePosition ?? "left";

  return (
    <Reorderable
      items={p.items}
      onReorder={p.onReorder}
      handle={showHandle() ? ".sl-handle" : undefined}
      class="ui-spy-sm w-full"
    >
      {(item, index) => (
        <div
          class="flex items-center gap-2"
          classList={{
            "cursor-grab": !showHandle(),
            "active:cursor-grabbing": !showHandle(),
          }}
        >
          <Show when={showHandle() && handlePos() === "left"}>
            <div class="sl-handle text-neutral flex h-4 w-4 shrink-0 cursor-grab active:cursor-grabbing">
              <GripVerticalIcon />
            </div>
          </Show>

          <div class="flex-1">{p.children(item, index)}</div>

          <Show when={showHandle() && handlePos() === "right"}>
            <div class="sl-handle text-neutral flex h-4 w-4 shrink-0 cursor-grab active:cursor-grabbing">
              <GripVerticalIcon />
            </div>
          </Show>
        </div>
      )}
    </Reorderable>
  );
}
