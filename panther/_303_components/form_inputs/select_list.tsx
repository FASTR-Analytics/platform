// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import type { SelectListItem, SelectOption } from "./types.ts";
import type { Intent } from "../types.ts";

export interface SelectListProps<T extends string = string> {
  options: SelectListItem<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  fullWidth?: boolean;
  renderOption?: (option: SelectOption<T>) => JSX.Element;
  emptyMessage?: string;
  horizontal?: boolean;
  align?: "left" | "center" | "right";
  intent?: Intent;
}

export function SelectList<T extends string = string>(p: SelectListProps<T>) {
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
        when={p.options.length > 0}
        fallback={
          <div class="text-sm">{p.emptyMessage || "No options available"}</div>
        }
      >
        <For each={p.options}>
          {(item) => {
            if ("type" in item) {
              if (item.type === "divider") {
                return <div class="border-b border-base-300 my-1" />;
              }
              if (item.type === "header") {
                return (
                  <div class="px-2 py-1 text-xs font-700 text-neutral">
                    {item.label}
                  </div>
                );
              }
            }

            const option = item as SelectOption<T>;
            return (
              <div
                class="cursor-pointer rounded px-2 py-1 text-sm"
                classList={{
                  "ui-hoverable": true,
                  "ui-intent-fill": !!p.intent,
                  "bg-base-200": !p.intent && option.value === p.value,
                }}
                data-intent={p.intent}
                data-outline={option.value !== p.value}
                onClick={() => p.onChange(option.value)}
              >
                <Show when={p.renderOption} fallback={option.label}>
                  {p.renderOption!(option)}
                </Show>
              </div>
            );
          }}
        </For>
      </Show>
    </div>
  );
}
