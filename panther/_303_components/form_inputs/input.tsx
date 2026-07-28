// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import type { Intent } from "../types.ts";
import { t3 } from "../deps.ts";
import { getInputClasses } from "./_internal/input_classes.ts";
import { IconRenderer } from "./icon_renderer.tsx";
import { useAutoFocus } from "./utils.ts";

type Props = {
  value: string;
  onChange?: (v: string) => void;
  label?: string;
  searchIcon?: boolean;
  clearable?: boolean;
  intent?: Intent;
  autoFocus?: boolean;
  fullWidth?: boolean;
  type?: string;
  invalidMsg?: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  size?: "sm";
  outline?: boolean;
  // id of a <datalist> to wire native autocomplete to (input `list` attr).
  list?: string;
};

export function Input(p: Props) {
  let inputEl: HTMLInputElement | undefined;

  const showClear = () => !!p.clearable && p.value !== "" && !p.disabled;

  function clear() {
    p.onChange?.("");
    inputEl?.focus();
  }

  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <div class="data-[left=true]:flex" data-left={!!p.searchIcon}>
        <Show when={p.searchIcon}>
          <div
            class={[
              p.size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
              p.size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
              "text-base-content-muted bg-base-200 flex flex-none items-center rounded-l border-y border-l",
            ].join(" ")}
            data-intent={p.intent}
          >
            <IconRenderer iconName="search" size={p.size} />
          </div>
        </Show>
        <Show when={p.label && !p.searchIcon}>
          <label class="ui-label" data-intent={p.intent}>
            {p.label}
          </label>
        </Show>
        <div class="relative flex min-w-0 flex-1">
          <input
            ref={(el) => {
              inputEl = el;
              useAutoFocus(el, p.autoFocus);
            }}
            class={getInputClasses(p.size, !!p.outline, p.intent)}
            data-mono={p.mono}
            data-clearable={showClear()}
            autofocus={p.autoFocus}
            type={p.type}
            onInput={(v) =>
              p.onChange?.(v.currentTarget.value)}
            value={p.value}
            placeholder={p.placeholder}
            data-left={!!p.searchIcon}
            disabled={p.disabled}
            list={p.list}
          />
          <Show when={showClear()}>
            <button
              type="button"
              class={[
                p.size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
                "ui-hoverable-base-100 text-base-content-muted absolute inset-y-0 right-[0.5em] z-20 my-auto flex h-[1.5em] w-[1.5em] items-center justify-center rounded",
              ].join(" ")}
              aria-label={t3({ en: "Clear", fr: "Effacer", pt: "Limpar" })}
              onMouseDown={(e) =>
                e.preventDefault()}
              onClick={clear}
            >
              <IconRenderer iconName="x" size={p.size} />
            </button>
          </Show>
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
