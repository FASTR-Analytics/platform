// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, JSX, Show } from "solid-js";
import { Intent } from "../types.ts";
import { SelectorIcon } from "../icons/mod.ts";
import { SelectOption } from "./types.ts";
import { useAutoFocus } from "./utils.ts";

// Select classes composed from utility classes and component classes
function getSelectClasses(size?: "sm") {
  return [
    // Component classes (defined in CSS)
    "ui-focusable",
    "ui-never-focusable", // Override focusable

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

    // Select specific
    "w-full",
    "cursor-pointer",
    "appearance-none",
    "truncate",
    "!pr-[2.5em]",

    // Mono variant
    "data-[mono=true]:font-mono",
  ].join(" ");
}

type Props<T extends string> = {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: string) => void;
  intent?: Intent;
  label?: string;
  fullWidth?: boolean;
  autoFocus?: boolean;
  invalidMsg?: string;
  mono?: boolean;
  size?: "sm";
};

export function Select<T extends string>(p: Props<T>) {
  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show when={p.label}>
        <label class="ui-label" data-intent={p.intent}>
          {p.label}
        </label>
      </Show>
      <div class="ui-form-text relative w-full">
        <select
          ref={(el) =>
            useAutoFocus(el, p.autoFocus)}
          value={p.value}
          onChange={(e) =>
            p.onChange(e.currentTarget.value)}
          class={getSelectClasses(p.size)}
          data-mono={p.mono}
          autofocus={p.autoFocus}
        >
          <For each={p.options}>
            {(opt) => {
              return <option value={opt.value}>{opt.label}</option>;
            }}
          </For>
        </select>
        <div class="text-base-content pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center">
          <SelectorIcon />
        </div>
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
    </div>
  );
}
