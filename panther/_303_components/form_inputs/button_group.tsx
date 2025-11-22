// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import type { IconName } from "../icons/mod.ts";
import type { Intent } from "../types.ts";
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

type ButtonGroupProps<T extends string> = {
  value: T | undefined;
  options: { value: T; label?: string; iconName?: IconName; intent?: Intent }[];
  onChange: (v: T) => void;
  label?: string | JSX.Element;
  fullWidth?: boolean;
  itemWidth?: string;
  size?: "sm";
};

export function ButtonGroup<T extends string>(p: ButtonGroupProps<T>) {
  return (
    <div class="">
      <Show when={p.label}>
        <label class="ui-label">{p.label}</label>
      </Show>
      <div
        class="inline-flex data-[width=true]:w-full"
        data-width={p.fullWidth}
      >
        <For each={p.options}>
          {(opt, i_opt) => {
            const i_selected = () =>
              p.options.findIndex((v) => v.value === p.value);
            const isSelected = () => opt.value === p.value;
            const isFirst = () => i_opt() === 0;
            const isLast = () => i_opt() === p.options.length - 1;
            const isLeftOfSelected = () => i_opt() === i_selected() - 1;

            return (
              <button
                class={getButtonGroupItemClasses(p.size)}
                style={{ width: p.itemWidth }}
                data-selected={isSelected()}
                data-first={isFirst()}
                data-last={isLast()}
                data-LeftOfSelected={isLeftOfSelected()}
                data-intent={opt.intent}
                data-outline={!isSelected()}
                onClick={() => p.onChange(opt.value)}
                type="button"
              >
                {/* Icon & Text */}
                <Show when={opt.label && opt.iconName}>
                  <IconRenderer iconName={opt.iconName} size={p.size} />
                  <span class="relative inline-flex min-h-[1.25em] items-center">
                    {opt.label}
                  </span>
                </Show>
                {/* Only Text */}
                <Show when={opt.label && !opt.iconName}>
                  <span class="relative inline-flex min-h-[1.25em] items-center">
                    {opt.label}
                  </span>
                </Show>
                {/* Only Icon */}
                <Show when={!opt.label && opt.iconName}>
                  <IconRenderer
                    iconName={opt.iconName}
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
