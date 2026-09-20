// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import type { Intent } from "../types.ts";

import { INTENT_BORDER, INTENT_SUBTLE } from "../_internal/intent_classes.ts";

type CalloutProps = {
  intent?: Intent;
  pad?: "sm" | "md";
  // Drops the border, leaving just the wash: for callouts that sit inside an
  // already-bordered container, or where the intent need not read at a glance
  // (DOC_UI_COLOR_AND_STATE.md, "Callouts and badges").
  noBorder?: boolean;
  class?: string;
  children: JSX.Element;
} & DataAttrs;

// Non-interactive by design (DOC_UI_COLOR_AND_STATE.md's wash-ban doctrine:
// a `-subtle` wash must never be a clickable rest surface). If a callout
// needs an action, put a real control inside it, filled with the same
// intent; never onClick the callout itself.
export function Callout(p: CalloutProps) {
  const [dataAttrs] = splitDataAttrs(p);
  const intent = () => p.intent ?? "primary";
  const border = () => p.noBorder ? "" : `border ${INTENT_BORDER[intent()]}`;
  const pad = () => (p.pad === "sm" ? "ui-pad-sm" : "ui-pad");

  return (
    <div
      {...dataAttrs}
      class={[
        INTENT_SUBTLE[intent()],
        border(),
        pad(),
        "ui-spy-sm rounded text-sm",
        p.class,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {p.children}
    </div>
  );
}
