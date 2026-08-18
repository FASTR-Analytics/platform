// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import type { Intent } from "../types.ts";

// Literal strings so the consumer app's Tailwind scan generates the classes —
// dynamic `border-${intent} bg-${intent}-subtle` templates would never be
// seen by the scanner. Washes exist only for the five color intents; see
// badge.tsx for the same constraint on the pill-shaped sibling of this
// component.
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

// DOC_UI_COLOR_AND_STATE.md's "Callouts and badges" recipe: border-{intent}
// only when the intent should read at a glance — the wash alone is often
// enough (see noBorder).
const BORDER_CLASSES: Record<Intent, string> = {
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

type CalloutProps = {
  intent?: Intent;
  pad?: "sm" | "md";
  // Drops the border, leaving just the wash — for callouts that sit inside
  // an already-bordered container, or where the intent doesn't need to read
  // at a glance.
  noBorder?: boolean;
  class?: string;
  children: JSX.Element;
} & DataAttrs;

// Non-interactive by design (DOC_UI_COLOR_AND_STATE.md's wash-ban doctrine —
// a `-subtle` wash must never be a clickable rest surface). If a callout
// needs an action, put a real control inside it, filled with the same
// intent — never onClick the callout itself.
export function Callout(p: CalloutProps) {
  const [dataAttrs] = splitDataAttrs(p);
  const intent = () => p.intent ?? "primary";
  const skin = () => SUBTLE_CLASSES[intent()];
  const border = () => p.noBorder ? "" : `border ${BORDER_CLASSES[intent()]}`;
  const pad = () => (p.pad === "sm" ? "ui-pad-sm" : "ui-pad");

  return (
    <div
      {...dataAttrs}
      class={[skin(), border(), pad(), "ui-spy-sm rounded text-sm", p.class]
        .filter(Boolean)
        .join(" ")}
    >
      {p.children}
    </div>
  );
}
