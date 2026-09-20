// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Intent } from "../types.ts";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import { useAutoFocus } from "./_internal/use_auto_focus.ts";
import { Field } from "./field.tsx";

function getTextAreaClasses(
  size?: "sm",
  mono?: boolean,
  resizable?: boolean,
): string {
  return [
    "ui-focusable",
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    mono ? "font-mono" : "font-400",
    "text-base-content",
    "bg-base-100",
    "rounded",
    "border",
    "block",
    "w-full",
    resizable ? "" : "resize-none",
    "data-[invalid=true]:border-danger",
  ]
    .filter(Boolean)
    .join(" ");
}

type TextAreaProps = {
  value: string;
  onChange?: (v: string) => void;
  label?: string;
  intent?: Intent;
  autoFocus?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  invalidMsg?: string;
  height?: string;
  // Visible line count (the native `rows` attribute). Ignored when `height`
  // or `fullHeight` sizes the box.
  rows?: number;
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent) => void;
  mono?: boolean;
  resizable?: boolean;
  disabled?: boolean;
  size?: "sm";
} & DataAttrs;

export function TextArea(p: TextAreaProps) {
  const [dataAttrs] = splitDataAttrs(p);
  return (
    <Field
      {...dataAttrs}
      label={p.label}
      intent={p.intent}
      invalidMsg={p.invalidMsg}
      width="w-[200px]"
      fullWidth={p.fullWidth}
      class="data-[height=true]:h-full"
      data-height={p.fullHeight}
    >
      <textarea
        ref={(el) => useAutoFocus(el, p.autoFocus)}
        class={getTextAreaClasses(p.size, p.mono, p.resizable)}
        data-intent={p.intent}
        data-invalid={!!p.invalidMsg}
        autofocus={p.autoFocus}
        onInput={(v) => p.onChange?.(v.currentTarget.value)}
        onKeyDown={p.onKeyDown}
        value={p.value}
        rows={p.fullHeight || p.height ? undefined : p.rows}
        style={{
          height: p.fullHeight ? "100%" : p.height,
          resize: p.resizable ? "vertical" : undefined,
        }}
        placeholder={p.placeholder}
        disabled={p.disabled}
      />
    </Field>
  );
}
