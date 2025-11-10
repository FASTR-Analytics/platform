// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import { Intent } from "../types.ts";
import { useAutoFocus } from "./utils.ts";

// TextArea classes composed from utility classes and component classes
const textAreaClasses = [
  // Component classes (defined in CSS)
  "ui-focusable",

  // Form utilities
  "px-3",
  "py-2",
  "text-sm",
  "leading-tight",
  "font-400",
  "text-base-content",

  // Appearance
  "border-base-300",
  "bg-base-100",
  "rounded",
  "border",

  // TextArea specific
  "w-full",
  "resize-none",
].join(" ");

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
  placeholder?: string;
  onKeyDown?: (e: KeyboardEvent) => void;
};

export function TextArea(p: TextAreaProps) {
  return (
    <div
      class="w-[200px] data-[height=true]:h-full data-[width=true]:w-full"
      data-width={p.fullWidth}
      data-height={p.fullHeight}
    >
      <Show when={p.label}>
        <label class="ui-label" data-intent={p.intent}>
          {p.label}
        </label>
      </Show>
      <textarea
        ref={(el) => useAutoFocus(el, p.autoFocus)}
        class={textAreaClasses}
        data-intent={p.intent}
        autofocus={p.autoFocus}
        onInput={(v) => p.onChange?.(v.currentTarget.value)}
        onKeyDown={p.onKeyDown}
        value={p.value}
        style={{ height: p.fullHeight ? "100%" : p.height }}
        placeholder={p.placeholder}
      />
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
    </div>
  );
}
