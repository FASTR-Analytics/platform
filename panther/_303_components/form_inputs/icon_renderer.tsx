// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { type IconName, iconOrFallback } from "../icons/mod.ts";

type IconRendererProps = {
  iconName?: IconName;
  invisible?: boolean;
  iconOnly?: boolean;
  size?: "sm";
};

export function IconRenderer(p: IconRendererProps) {
  const textSizeClass = p.size === "sm"
    ? "ui-form-text-size-sm"
    : "ui-form-text-size";
  const correctionClass = p.size === "sm"
    ? "ui-icon-only-correction-sm"
    : "ui-icon-only-correction";

  return (
    <Show when={p.iconName} keyed>
      {(iconName) => {
        return (
          <span
            class={[
              textSizeClass,
              "relative h-[1.25em] w-[1.25em] flex-none overflow-clip rounded",
              p.iconOnly && correctionClass,
              p.invisible && "invisible",
            ].filter(Boolean).join(" ")}
          >
            <Dynamic component={iconOrFallback(iconName)} />
          </span>
        );
      }}
    </Show>
  );
}
