// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Intent } from "../../types.ts";

// Input classes composed from utility classes and component classes. Shared
// by Input and the native date/time picker inputs so they render identically.
export function getInputClasses(
  size: "sm" | undefined,
  outline: boolean,
  intent?: Intent,
) {
  return [
    // Component classes (defined in CSS)
    "ui-focusable",

    // Form utilities
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",

    // Appearance: Button-identical intent outline skin (stateless), or
    // neutral box
    ...(outline
      ? [`ui-outline-${intent ?? "primary"}`]
      : ["text-base-content", "bg-base-100"]),
    "rounded",
    "border",

    // Width
    "w-full",

    // Left variant for search icon
    "data-[left=true]:rounded-l-[0px]",

    // Mono variant
    "data-[mono=true]:font-mono",

    // Disabled state
    "disabled:opacity-40",
  ].join(" ");
}
