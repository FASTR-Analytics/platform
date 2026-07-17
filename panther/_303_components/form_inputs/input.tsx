// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Match, Show, Switch } from "solid-js";
import type { Intent } from "../types.ts";
import { Icon } from "../icons/mod.ts";
import { getInputClasses } from "./_internal/input_classes.ts";
import { useAutoFocus } from "./utils.ts";

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
  outline?: boolean;
  // id of a <datalist> to wire native autocomplete to (input `list` attr).
  list?: string;
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
            <Match when>
              <label
                class="ui-form-text ui-form-pad bg-base-200 flex items-center rounded-l border-y border-l"
                data-intent={p.intent}
                data-left={!!p.searchIcon}
              >
                <span class="text-base-content-muted h-[1.25em] w-[1.25em] flex-none">
                  <Icon iconName="search" />
                </span>
                {/* <span class="ml-2">{p.label}</span> */}
              </label>
            </Match>
          </Switch>
        </Show>
        <input
          ref={(el) =>
            useAutoFocus(el, p.autoFocus)}
          class={getInputClasses(p.size, !!p.outline, p.intent)}
          data-mono={p.mono}
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
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
    </div>
  );
}
