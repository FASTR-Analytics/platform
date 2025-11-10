// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, JSX, Match, Show, Switch } from "solid-js";
import { SelectOption } from "./types.ts";

type RadioGroupProps<T extends string> = {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: string) => void;
  label?: string | JSX.Element;
  horizontal?: boolean;
};

export function RadioGroup<T extends string>(p: RadioGroupProps<T>) {
  return (
    <div class="">
      <Show when={p.label}>
        <legend class="ui-label">{p.label}</legend>
      </Show>
      <div
        class="data-[horizontal=true]:ui-gap-sm data-[horizontal=true]:flex data-[horizontal=true]:items-center data-[horizontal=false]:space-y-1"
        data-horizontal={!!p.horizontal}
      >
        <For each={p.options}>
          {(opt) => {
            return (
              <label class="flex w-fit items-center">
                <div class="relative mr-2 h-5 w-5 flex-none">
                  <input
                    checked={opt.value === p.value}
                    type="radio"
                    onChange={() => p.onChange(opt.value)}
                    class="ui-focusable border-base-300 bg-base-100 text-base-content peer h-5 w-5 cursor-pointer appearance-none rounded-full border"
                  />
                  <div class="bg-base-content pointer-events-none absolute inset-1 hidden h-3 w-3 rounded-full peer-checked:block" />
                </div>
                <Switch>
                  <Match when={typeof opt.label === "string"}>
                    <span class="ui-form-text select-none">{opt.label}</span>
                  </Match>
                  <Match when={true}>{opt.label}</Match>
                </Switch>
              </label>
            );
          }}
        </For>
      </div>
    </div>
  );
}
