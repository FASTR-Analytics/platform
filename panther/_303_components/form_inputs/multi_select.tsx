// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, JSX, Show } from "solid-js";
import type { Intent } from "../types.ts";
import { SelectOption } from "./types.ts";
import { Checkbox } from "./checkbox.tsx";

type MultiSelectProps<T extends string> = {
  values: T[];
  options: SelectOption<T>[];
  onChange: (v: T[]) => void;
  label?: string | JSX.Element;
  horizontal?: boolean;
  inverted?: boolean;
  showSelectAll?: boolean;
  intentWhenChecked?: Intent;
};

export function MultiSelect<T extends string>(p: MultiSelectProps<T>) {
  const validOptionValues = createMemo(() => p.options.map((opt) => opt.value));

  const allSelected = createMemo(() => {
    if (p.inverted) {
      return p.values.length === 0;
    }
    return p.values.length === p.options.length;
  });

  const someSelected = createMemo(() => {
    return p.values.length > 0 && p.values.length < p.options.length;
  });

  function toggleSelectAll() {
    if (allSelected()) {
      p.onChange([]);
    } else {
      p.onChange(validOptionValues());
    }
  }

  function updateCheckbox(c: boolean, value: T) {
    const validCurrentValues = p.values.filter((v) =>
      validOptionValues().includes(v)
    );

    if (p.inverted) {
      if (c) {
        p.onChange(validCurrentValues.filter((v) => v !== value));
      } else {
        p.onChange([...validCurrentValues, value]);
      }
      return;
    }
    if (c) {
      p.onChange([...validCurrentValues, value]);
    } else {
      p.onChange(validCurrentValues.filter((v) => v !== value));
    }
  }

  return (
    <div class="">
      <Show when={p.label}>
        <legend class="ui-label">{p.label}</legend>
      </Show>
      <div
        class="data-[horizontal=true]:flex data-[horizontal=true]:items-center data-[horizontal=true]:gap-3 data-[horizontal=false]:space-y-1"
        data-horizontal={!!p.horizontal}
      >
        <Show when={p.showSelectAll}>
          <div class="">
            <Checkbox
              label="Select All"
              checked={allSelected()}
              indeterminate={someSelected()}
              onChange={toggleSelectAll}
              intentWhenChecked={p.intentWhenChecked}
            />
          </div>
          <Show when={!p.horizontal}>
            <div class="border-base-300 my-1 border-b" />
          </Show>
        </Show>
        <For each={p.options}>
          {(opt) => {
            return (
              <div class="">
                <Checkbox
                  label={opt.label}
                  checked={p.inverted
                    ? !p.values.includes(opt.value)
                    : p.values.includes(opt.value)}
                  onChange={(c) => updateCheckbox(c, opt.value)}
                  intentWhenChecked={p.intentWhenChecked}
                />
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
