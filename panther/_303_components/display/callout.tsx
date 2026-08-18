// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import type { Intent } from "../types.ts";

// Literal strings so the consumer app's Tailwind scan generates the classes —
// dynamic `border-${intent} bg-${intent}-subtle` templates would never be
// seen by the scanner. Washes exist only for the five color intents; see
// badge.tsx for the same constraint on the pill-shaped sibling of this
// component.
const SUBTLE_CLASSES: Record<Intent, string> = {
  primary: "border-primary bg-primary-subtle text-primary-subtle-content",
  neutral: "border-neutral bg-neutral-subtle text-neutral-subtle-content",
  success: "border-success bg-success-subtle text-success-subtle-content",
  warning: "border-warning bg-warning-subtle text-warning-subtle-content",
  danger: "border-danger bg-danger-subtle text-danger-subtle-content",
  "base-content": "border-base-content ui-fill-base-content",
  "base-100": "border-base-300 ui-fill-base-100",
  "base-200": "border-base-300 ui-fill-base-200",
  "base-300": "border-base-300 ui-fill-base-300",
};

type CalloutProps = {
  intent?: Intent;
  pad?: "sm" | "md";
  class?: string;
  children: JSX.Element;
};

// Non-interactive by design (DOC_UI_COLOR_AND_STATE.md's wash-ban doctrine —
// a `-subtle` wash must never be a clickable rest surface). If a callout
// needs an action, put a real control inside it, filled with the same
// intent — never onClick the callout itself.
export function Callout(p: CalloutProps) {
  const skin = () => SUBTLE_CLASSES[p.intent ?? "primary"];
  const pad = () => (p.pad === "sm" ? "ui-pad-sm" : "ui-pad");

  return (
    <div
      class={[skin(), pad(), "ui-spy-sm rounded border text-sm", p.class]
        .filter(Boolean)
        .join(" ")}
    >
      {p.children}
    </div>
  );
}
