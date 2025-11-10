// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createSignal, type JSX, Show } from "solid-js";
import type { SelectOption } from "./types.ts";
import SortableVendor from "./solid_sortablejs_vendored.tsx";
import { GripVerticalIcon } from "../icons/icons.tsx";
import type { Intent } from "../types.ts";

export interface SelectListSortableProps<T extends string = string> {
  options: SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  onReorder: (options: SelectOption<T>[]) => void;
  fullWidth?: boolean;
  renderOption?: (option: SelectOption<T>) => JSX.Element;
  emptyMessage?: string;
  handlePosition?: "left" | "right";
  intent?: Intent;
}

export function SelectListSortable<T extends string = string>(
  p: SelectListSortableProps<T>,
) {
  const [orderedOptions, setOrderedOptions] = createSignal(p.options);
  const [showSortable, setShowSortable] = createSignal(true);

  createEffect(() => {
    setShowSortable(false);
    setOrderedOptions(p.options);
    queueMicrotask(() => setShowSortable(true));
  });

  const handleReorder = (newOptions: SelectOption<T>[]) => {
    setOrderedOptions(newOptions);
    p.onReorder(newOptions);
  };

  return (
    <div class="ui-spy-sm data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show
        when={orderedOptions().length > 0}
        fallback={
          <div class="text-sm">{p.emptyMessage || "No options available"}</div>
        }
      >
        <Show when={showSortable()} keyed>
          {(_) => (
            <SortableVendor
              idField="value"
              items={orderedOptions()}
              setItems={handleReorder}
              animation={150}
              ghostClass="opacity-50"
              chosenClass="shadow-2xl"
              dragClass="cursor-grabbing"
              fallbackTolerance={3}
              handle=".drag-handle"
              class="ui-spy-sm"
            >
              {(option: SelectOption<T>) => (
                <div
                  class="flex items-center rounded text-sm"
                  classList={{
                    "ui-hoverable": true,
                    "ui-intent-fill": !!p.intent,
                    "bg-base-200": !p.intent && option.value === p.value,
                  }}
                  data-intent={p.intent}
                  data-outline={option.value !== p.value}
                >
                  <Show when={p.handlePosition !== "right"}>
                    <div class="drag-handle text-neutral flex h-6 w-6 shrink-0 cursor-grab py-1 pl-2 active:cursor-grabbing">
                      <GripVerticalIcon />
                    </div>
                  </Show>

                  <div
                    class="flex-1 cursor-pointer px-2 py-1"
                    onClick={() => p.onChange(option.value)}
                  >
                    <Show when={p.renderOption} fallback={option.label}>
                      {p.renderOption!(option)}
                    </Show>
                  </div>

                  <Show when={p.handlePosition === "right"}>
                    <div class="drag-handle text-neutral flex h-6 w-6 shrink-0 cursor-grab py-1 pr-2 active:cursor-grabbing">
                      <GripVerticalIcon />
                    </div>
                  </Show>
                </div>
              )}
            </SortableVendor>
          )}
        </Show>
      </Show>
    </div>
  );
}
