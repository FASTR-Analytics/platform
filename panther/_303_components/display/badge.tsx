// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import type { Intent } from "../types.ts";

// Literal strings so the consumer app's Tailwind scan generates the classes —
// dynamic `bg-${intent}-subtle` templates would never be seen by the scanner.
// Washes exist only for the five color intents; the surface intents take their
// fill skin instead (a surface is already quiet).
const SUBTLE_CLASSES: Record<Intent, string> = {
  primary: "bg-primary-subtle text-primary-subtle-content",
  neutral: "bg-neutral-subtle text-neutral-subtle-content",
  success: "bg-success-subtle text-success-subtle-content",
  warning: "bg-warning-subtle text-warning-subtle-content",
  danger: "bg-danger-subtle text-danger-subtle-content",
  "base-content": "ui-fill-base-content",
  "base-100": "ui-fill-base-100",
  "base-200": "ui-fill-base-200",
  "base-300": "ui-fill-base-300",
};

type BadgeProps = {
  intent?: Intent;
  variant?: "subtle" | "solid";
  children: JSX.Element;
};

export function Badge(p: BadgeProps) {
  const skin = () => {
    const intent = p.intent ?? "primary";
    return p.variant === "solid" ? `ui-fill-${intent}` : SUBTLE_CLASSES[intent];
  };

  return (
    <span
      class={`${skin()} font-400 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs`}
    >
      {p.children}
    </span>
  );
}
