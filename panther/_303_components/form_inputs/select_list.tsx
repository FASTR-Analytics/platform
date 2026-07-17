// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import {
  isListItem,
  type ListEntry,
  type ListItem,
} from "../list_selection/list_item_types.ts";
import type { Intent } from "../types.ts";

export interface SelectListProps<T extends string = string, M = never> {
  items: ListEntry<T, M>[];
  value: T | undefined;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  renderItem?: (item: ListItem<T, M>) => JSX.Element;
  emptyMessage?: string;
  horizontal?: boolean;
  align?: "left" | "center" | "right";
  intent?: Intent;
}

export function SelectList<T extends string = string, M = never>(
  p: SelectListProps<T, M>,
) {
  const alignClass = () => {
    if (!p.horizontal) return "";
    switch (p.align) {
      case "center":
        return "justify-center";
      case "right":
        return "justify-end";
      default:
        return "justify-start";
    }
  };

  const containerClass = () => {
    if (p.horizontal) {
      return `ui-gap-sm flex flex-wrap data-[width=true]:w-full ${alignClass()}`;
    }
    return "ui-spy-sm data-[width=true]:w-full";
  };

  return (
    <div class={containerClass()} data-width={p.fullWidth}>
      <Show
        when={p.items.length > 0}
        fallback={
          <div class="text-sm">
            {p.emptyMessage ||
              t3({
                en: "No options available",
                fr: "Aucune option disponible",
                pt: "Sem opções disponíveis",
              })}
          </div>
        }
      >
        <For each={p.items}>
          {(item) => {
            if (!isListItem(item)) {
              if ("divider" in item) {
                return <div class="my-1 border-b" />;
              }
              return (
                <div class="text-base-content-muted px-2 py-1 text-xs font-700">
                  {item.header}
                </div>
              );
            }
            return (
              <div
                class="cursor-pointer rounded px-2 py-1 text-sm"
                classList={{
                  "ui-hoverable-base-100": item.id !== p.value,
                  [`ui-fill-${p.intent}`]: !!p.intent && item.id === p.value,
                  [`ui-hoverable-${p.intent}`]: !!p.intent &&
                    item.id === p.value,
                  "bg-base-200": !p.intent && item.id === p.value,
                }}
                onClick={() => p.onChange(item.id)}
              >
                <Show when={p.renderItem} fallback={item.label}>
                  {p.renderItem!(item)}
                </Show>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
