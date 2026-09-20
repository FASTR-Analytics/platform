// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Intent } from "../types.ts";

// Literal strings so the consumer app's Tailwind scan generates the classes:
// a `bg-${intent}-subtle` template would never be seen by the scanner. Washes
// exist only for the five colour intents; the surface intents take their fill
// skin instead (a surface is already quiet).
export const INTENT_SUBTLE: Record<Intent, string> = {
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

export const INTENT_BORDER: Record<Intent, string> = {
  primary: "border-primary",
  neutral: "border-neutral",
  success: "border-success",
  warning: "border-warning",
  danger: "border-danger",
  "base-content": "border-base-content",
  "base-100": "border-base-300",
  "base-200": "border-base-300",
  "base-300": "border-base-300",
};

export const INTENT_BG: Record<Intent, string> = {
  primary: "bg-primary",
  neutral: "bg-neutral",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  "base-content": "bg-base-content",
  "base-100": "bg-base-100",
  "base-200": "bg-base-200",
  "base-300": "bg-base-300",
};

export const INTENT_TEXT: Record<Intent, string> = {
  primary: "text-primary",
  neutral: "text-neutral",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  "base-content": "text-base-content",
  "base-100": "text-base-100",
  "base-200": "text-base-200",
  "base-300": "text-base-300",
};

export function intentDotClass(intent: Intent): string {
  return `h-2 w-2 flex-none rounded-full ${INTENT_BG[intent]}`;
}
