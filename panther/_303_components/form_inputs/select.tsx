// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import type { Intent } from "../types.ts";
import { Icon } from "../icons/mod.ts";
import type { SelectOption } from "./types.ts";
import { useAutoFocus } from "./utils.ts";

// Select classes composed from utility classes and component classes
function getSelectClasses(
  size: "sm" | undefined,
  outline: boolean,
  intent?: Intent,
) {
  return [
    // Component classes (defined in CSS)
    "ui-focusable",
    "ui-never-focusable", // Override focusable

    // Form utilities
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",

    // Appearance: Button-identical intent outline skin (stateless — the
    // deliberate skin-without-behavior composition), or neutral box
    ...(outline
      ? [`ui-outline-${intent ?? "primary"}`]
      : ["text-base-content", "bg-base-100"]),
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

    // Placeholder state (grey text when no value selected)
    "data-[placeholder=true]:text-base-content-muted",

    // Disabled state
    "disabled:opacity-40",
  ].join(" ");
}

type Props<T extends string> = {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  intent?: Intent;
  label?: string | JSX.Element;
  placeholder?: string;
  fullWidth?: boolean;
  autoFocus?: boolean;
  invalidMsg?: string;
  mono?: boolean;
  disabled?: boolean;
  size?: "sm";
  outline?: boolean;
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
          value={p.value ?? ""}
          onChange={(e) =>
            p.onChange(e.currentTarget.value as T)}
          class={getSelectClasses(p.size, !!p.outline, p.intent)}
          data-mono={p.mono}
          data-placeholder={p.placeholder && !p.value}
          autofocus={p.autoFocus}
          disabled={p.disabled}
        >
          <Show when={p.placeholder && !p.value}>
            <option value="" disabled>
              {p.placeholder}
            </option>
          </Show>
          <For each={p.options}>
            {(opt) => {
              return <option value={opt.value}>{opt.label}</option>;
            }}
          </For>
        </select>
        <div
          class="pointer-events-none absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center"
          classList={{
            "text-base-content": !p.outline,
            [`ui-outline-${p.intent ?? "primary"}`]: !!p.outline,
          }}
        >
          <Icon iconName="selector" />
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
