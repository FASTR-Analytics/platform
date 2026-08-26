// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MessageIntent } from "../../_core/types.ts";

// Literal strings so the consumer app's Tailwind scan generates the classes
// (see callout.tsx for the same constraint). Wash + paired -subtle-content:
// the doctrine's text color on a wash surface.
const WASH_CLASSES: Record<MessageIntent, string> = {
  primary: "bg-primary-subtle text-primary-subtle-content",
  neutral: "bg-neutral-subtle text-neutral-subtle-content",
  success: "bg-success-subtle text-success-subtle-content",
  warning: "bg-warning-subtle text-warning-subtle-content",
  danger: "bg-danger-subtle text-danger-subtle-content",
};

export function messageWashClasses(intent: MessageIntent): string {
  return WASH_CLASSES[intent];
}
