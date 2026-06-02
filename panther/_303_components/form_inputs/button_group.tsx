// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import type { ListItem } from "../list_selection/list_item_types.ts";
import { IconRenderer } from "./icon_renderer.tsx";

// Button group item classes composed from utility classes and component classes
function getButtonGroupItemClasses(size?: "sm") {
  return [
    // Component classes (defined in CSS)
    "ui-hoverable",
    "ui-focusable",
    "ui-intent-fill",

    // Form utilities
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",

    // Layout and appearance
    "inline-flex",
    "select-none",
    "appearance-none",
    "items-center",
    "justify-center",
    "gap-[0.5em]",
    "flex-1",
    "border-y",
    "border-r",

    // Conditional styles
    "data-[first=true]:rounded-l",
    "data-[last=true]:rounded-r",
    "data-[first=true]:border-l",
    "data-[selected=true]:border",
    "data-[selected=false]:text-neutral",
    "data-[selected=false]:border-base-300",
    "data-[selected=false]:bg-base-100",
    "data-[selected=false]:focus-visible:border",
    "data-[LeftOfSelected=true]:border-r-0",
  ].join(" ");
}

// Segmented single-select skin. Shares the `ListItem` contract with `SelectList`
// and `TabsNavigation` (swap = rename). Icon-only buttons: pass an empty `label`
// and a `labelText` for the aria-label.
export type ButtonGroupProps<T extends string, M = never> = {
  value: T | undefined;
  items: ListItem<T, M>[];
  onChange: (v: T | undefined) => void;
  label?: string | JSX.Element;
  fullWidth?: boolean;
  itemWidth?: string;
  size?: "sm";
  allowDeselect?: boolean;
};

export function ButtonGroup<T extends string, M = never>(
  p: ButtonGroupProps<T, M>,
) {
  return (
    <div class="">
      <Show when={p.label}>
        <label class="ui-label block">{p.label}</label>
      </Show>
      <div
        class="inline-flex data-[width=true]:w-full"
        data-width={p.fullWidth}
      >
        <For each={p.items}>
          {(item, i_opt) => {
            const i_selected = () => p.items.findIndex((v) => v.id === p.value);
            const isSelected = () => item.id === p.value;
            const isFirst = () => i_opt() === 0;
            const isLast = () => i_opt() === p.items.length - 1;
            const isLeftOfSelected = () => i_opt() === i_selected() - 1;
            const hasLabel = () => !!item.label;

            return (
              <button
                class={getButtonGroupItemClasses(p.size)}
                style={{ width: p.itemWidth }}
                data-selected={isSelected()}
                data-first={isFirst()}
                data-last={isLast()}
                data-LeftOfSelected={isLeftOfSelected()}
                data-intent={item.intent}
                data-outline={!isSelected()}
                aria-label={item.labelText}
                disabled={item.disabled}
                onClick={() =>
                  p.onChange(
                    p.allowDeselect && isSelected() ? undefined : item.id,
                  )}
                type="button"
              >
                {/* Icon & Text */}
                <Show when={hasLabel() && item.iconName}>
                  <IconRenderer iconName={item.iconName} size={p.size} />
                  <span class="relative inline-flex min-h-[1.25em] items-center">
                    {item.label}
                  </span>
                </Show>
                {/* Only Text */}
                <Show when={hasLabel() && !item.iconName}>
                  <span class="relative inline-flex min-h-[1.25em] items-center">
                    {item.label}
                  </span>
                </Show>
                {/* Only Icon */}
                <Show when={!hasLabel() && item.iconName}>
                  <IconRenderer
                    iconName={item.iconName}
                    iconOnly
                    size={p.size}
                  />
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
