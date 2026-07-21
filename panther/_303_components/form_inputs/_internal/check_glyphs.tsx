// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The check / indeterminate glyphs used by Checkbox and by presentational
// check squares (e.g. MultiSelectSearch rows). Positioning, sizing, and
// visibility (e.g. peer-checked) are the caller's job via `class`.
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
