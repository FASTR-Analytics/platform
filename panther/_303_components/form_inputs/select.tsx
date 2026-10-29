// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, For, type JSX, Show } from "solid-js";
import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import { Icon } from "../icons/mod.ts";
import type { SelectOption } from "./types.ts";
import { getSelectClasses } from "./_internal/input_classes.ts";
import { useAutoFocus } from "./_internal/use_auto_focus.ts";
import { Field } from "./field.tsx";

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
} & DataAttrs;

export function Select<T extends string>(p: Props<T>) {
  const [dataAttrs] = splitDataAttrs(p);
  let el!: HTMLSelectElement;
  const placeholderShown = () => !!p.placeholder && !p.value;

  // The selection is stated as an index, which is the only thing that can also
  // say "no option matches". A value on the <select> loses it: Solid writes
  // that value only when it changes, while <For> keys its rows by object
  // identity, so options handed in as new objects are made again and the
  // browser falls back to the first one. A selected flag on each option keeps
  // it through a rebuild but cannot express the empty case either, because the
  // browser's own reset then picks the first enabled option. The effect runs
  // after <For> has updated the DOM, so it reads the option list on screen.
  createEffect(() => {
    const i = p.options.findIndex((opt) => opt.value === p.value);
    el.selectedIndex = placeholderShown() ? 0 : i;
  });

  return (
    <Field
      {...dataAttrs}
      label={p.label}
      intent={p.intent}
      invalidMsg={p.invalidMsg}
      width="w-[200px]"
      fullWidth={p.fullWidth}
    >
      <div class="ui-form-text relative w-full">
        <select
          ref={(e) => {
            el = e;
            useAutoFocus(e, p.autoFocus);
          }}
          onChange={(e) => p.onChange(e.currentTarget.value as T)}
          class={getSelectClasses(p.size, !!p.outline, p.intent)}
          data-mono={p.mono}
          data-invalid={!!p.invalidMsg}
          data-placeholder={p.placeholder && !p.value}
          autofocus={p.autoFocus}
          disabled={p.disabled}
        >
          <Show when={placeholderShown()}>
            <option value="" disabled>
              {p.placeholder}
            </option>
          </Show>
          <For each={p.options}>
            {(opt) => <option value={opt.value}>{opt.label}</option>}
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
    </Field>
  );
}
