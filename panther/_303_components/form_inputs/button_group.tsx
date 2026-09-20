// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import type { ListItem } from "../list_selection/list_item_types.ts";
import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import { IconRenderer } from "./icon_renderer.tsx";
import { Field } from "./field.tsx";

// Both arms take their surface and states from the hoverable family (added
// per arm in classList): selected = the item's intent (+ ui-fill skin),
// unselected = the declared onBackground token (quiet interactive of that
// surface).
function getButtonGroupItemClasses(size?: "sm") {
  return [
    "ui-focusable",
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",
    "inline-flex",
    "cursor-pointer",
    "select-none",
    "appearance-none",
    "items-center",
    "justify-center",
    "gap-[0.5em]",
    "border-y",
    "border-r",
    "data-[first=true]:rounded-l",
    "data-[last=true]:rounded-r",
    "data-[first=true]:border-l",
    "data-[selected=true]:border",
    "data-[selected=false]:text-base-content-muted",
    "data-[selected=false]:border-border",
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
  onBackground?: Intent;
} & DataAttrs;

export function ButtonGroup<T extends string, M = never>(
  p: ButtonGroupProps<T, M>,
) {
  const [dataAttrs] = splitDataAttrs(p);
  return (
    <Field {...dataAttrs} label={p.label} fullWidth={p.fullWidth}>
      <div
        class="inline-grid auto-cols-fr grid-flow-col data-[width=true]:w-full"
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
                classList={{
                  [`ui-fill-${item.intent ?? "primary"}`]: isSelected(),
                  [`ui-hoverable-${item.intent ?? "primary"}`]: isSelected(),
                  [`ui-hoverable-${p.onBackground ?? "base-100"}`]:
                    !isSelected(),
                }}
                style={{ width: p.itemWidth }}
                data-selected={isSelected()}
                data-first={isFirst()}
                data-last={isLast()}
                data-LeftOfSelected={isLeftOfSelected()}
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
                  <span class="relative inline-flex min-h-[var(--ui-form-content-h-em)] items-center">
                    {item.label}
                  </span>
                </Show>
                {/* Only Text */}
                <Show when={hasLabel() && !item.iconName}>
                  <span class="relative inline-flex min-h-[var(--ui-form-content-h-em)] items-center">
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
    </Field>
  );
}
