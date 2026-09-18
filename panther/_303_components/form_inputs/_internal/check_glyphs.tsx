// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";

// The check / indeterminate glyphs used by Checkbox and by CheckMark below.
// Positioning, sizing, and visibility (e.g. peer-checked) are the caller's job
// via `class`.
export function CheckSvg(p: { class: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class={p.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12l5 5l10 -10" />
    </svg>
  );
}

export function IndeterminateSvg(p: { class: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class={p.class}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

// Presentational check square for clickable option rows, built from Checkbox's
// glyph internals but deliberately smaller — it reads as part of the larger
// control, not a standalone form checkbox. Not the interactive Checkbox
// component: the row is the click target here, and nesting a labeled input
// inside a clickable row would double-fire and fight the panel's focus
// handling.
export function CheckMark(p: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span class="bg-base-100 relative h-4 w-4 flex-none rounded border">
      <Show when={p.indeterminate}>
        <IndeterminateSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
      </Show>
      <Show when={p.checked && !p.indeterminate}>
        <CheckSvg class="text-base-content pointer-events-none absolute inset-0 m-auto h-3 w-3" />
      </Show>
    </span>
  );
}
