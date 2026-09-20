// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import type { Intent } from "../types.ts";

import { INTENT_SUBTLE } from "../_internal/intent_classes.ts";

type BadgeProps = {
  intent?: Intent;
  variant?: "subtle" | "solid";
  bold?: boolean;
  children: JSX.Element;
};

export function Badge(p: BadgeProps) {
  const skin = () => {
    const intent = p.intent ?? "primary";
    return p.variant === "solid" ? `ui-fill-${intent}` : INTENT_SUBTLE[intent];
  };

  return (
    <span
      class={`${skin()} ${
        p.bold ? "font-700" : "font-400"
      } inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs`}
    >
      {p.children}
    </span>
  );
}
