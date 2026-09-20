// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";

type FieldProps = {
  label?: string | JSX.Element;
  // Ties the label to a control by id. Most kit controls omit it: their
  // label is visual only and sits above the control, not around it.
  labelFor?: string;
  intent?: Intent;
  invalidMsg?: string;
  // Width class of the field at rest (a control's natural width). Omitted for
  // a field that should take the width of its content.
  width?: string;
  fullWidth?: boolean;
  class?: string;
  children: JSX.Element;
} & DataAttrs;

// The frame every form control renders inside: label above, control, invalid
// message below, one width rule. Also the app-facing wrapper for a control the
// kit does not label itself. [contain:inline-size] keeps the label and message
// out of the field's intrinsic width so a w-fit control is sized by the
// control alone; block children still stretch to the field's width.
export function Field(p: FieldProps) {
  const [dataAttrs] = splitDataAttrs(p);
  return (
    <div
      {...dataAttrs}
      class={[p.width, "data-[width=true]:w-full", p.class]
        .filter(Boolean)
        .join(" ")}
      data-width={p.fullWidth}
    >
      <Show when={p.label}>
        <div class="[contain:inline-size]">
          <label class="ui-label" for={p.labelFor} data-intent={p.intent}>
            {p.label}
          </label>
        </div>
      </Show>
      {p.children}
      <Show when={p.invalidMsg}>
        <div class="[contain:inline-size]">
          <div class="ui-text-small text-danger inline-block pt-1">
            {p.invalidMsg}
          </div>
        </div>
      </Show>
    </div>
  );
}
