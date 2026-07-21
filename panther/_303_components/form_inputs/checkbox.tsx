// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Match, Show, Switch } from "solid-js";
import type { Intent } from "../types.ts";
import { CheckSvg, IndeterminateSvg } from "./_internal/check_glyphs.tsx";

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string | JSX.Element;
  disabled?: boolean;
  indeterminate?: boolean;
  intentWhenChecked?: Intent;
};

export function Checkbox(p: CheckboxProps) {
  return (
    <label class="ui-form-text flex w-fit items-center">
      <div class="relative mr-2 h-5 w-5 flex-none">
        <input
          checked={p.checked}
          type="checkbox"
          onChange={(v) => p.onChange(v.currentTarget.checked)}
          classList={{
            "ui-focusable": true,
            "peer": true,
            "h-5": true,
            "w-5": true,
            "cursor-pointer": true,
            "appearance-none": true,
            "rounded": true,
            "border": true,
            "ui-checkbox-intent": !!p.intentWhenChecked,
            "bg-base-100": !p.intentWhenChecked,
            "text-base-content": !p.intentWhenChecked,
          }}
          disabled={p.disabled}
          data-intent={p.intentWhenChecked}
        />
        <Show when={p.indeterminate}>
          <IndeterminateSvg class="text-base-content pointer-events-none absolute inset-0.5 h-4 w-4" />
        </Show>
        <Show when={!p.indeterminate}>
          <CheckSvg class="text-base-content pointer-events-none absolute inset-0.5 hidden h-4 w-4 peer-checked:block" />
        </Show>
      </div>
      <Switch>
        <Match when={typeof p.label === "string"}>
          <span class="select-none">{p.label}</span>
        </Match>
        <Match when>{p.label}</Match>
      </Switch>
    </label>
  );
}
