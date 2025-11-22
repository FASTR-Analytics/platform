// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Match, Show, Switch } from "solid-js";
import { Intent } from "../types.ts";
import { SearchIcon } from "../icons/mod.ts";
import { useAutoFocus } from "./utils.ts";

// Input classes composed from utility classes and component classes
function getInputClasses(size?: "sm") {
  return [
    // Component classes (defined in CSS)
    "ui-focusable",

    // Form utilities
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",
    "text-base-content",

    // Appearance
    "border-base-300",
    "bg-base-100",
    "rounded",
    "border",

    // Width
    "w-full",

    // Left variant for search icon
    "data-[left=true]:rounded-l-[0px]",

    // Mono variant
    "data-[mono=true]:font-mono",

    // Disabled state
    "disabled:opacity-50",
  ].join(" ");
}

type Props = {
  value: string;
  onChange?: (v: string) => void;
  label?: string;
  searchIcon?: boolean;
  intent?: Intent;
  autoFocus?: boolean;
  fullWidth?: boolean;
  type?: string;
  invalidMsg?: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  size?: "sm";
};

export function Input(p: Props) {
  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <div class="data-[left=true]:flex" data-left={!!p.searchIcon}>
        <Show when={p.label}>
          <Switch>
            <Match when={!p.searchIcon}>
              <label
                class="ui-label"
                data-intent={p.intent}
                data-left={!!p.searchIcon}
              >
                {p.label}
              </label>
            </Match>
            <Match when={true}>
              <label
                class="ui-form-text ui-form-pad bg-base-200 border-base-300 flex items-center rounded-l border-y border-l"
                data-intent={p.intent}
                data-left={!!p.searchIcon}
              >
                <span class="text-neutral h-[1.25em] w-[1.25em] flex-none">
                  <SearchIcon />
                </span>
                {/* <span class="ml-2">{p.label}</span> */}
              </label>
            </Match>
          </Switch>
        </Show>
        <input
          ref={(el) =>
            useAutoFocus(el, p.autoFocus)}
          class={getInputClasses(p.size)}
          data-intent={p.intent}
          data-mono={p.mono}
          autofocus={p.autoFocus}
          type={p.type}
          onInput={(v) =>
            p.onChange?.(v.currentTarget.value)}
          value={p.value}
          placeholder={p.placeholder}
          data-left={!!p.searchIcon}
          disabled={p.disabled}
        />
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
    </div>
  );
}
