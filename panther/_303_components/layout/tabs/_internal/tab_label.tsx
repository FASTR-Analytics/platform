// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import { IconRenderer } from "../../../form_inputs/icon_renderer.tsx";
import { Badge } from "../../../display/badge.tsx";
import type { ListItem } from "../../../list_selection/list_item_types.ts";
import { intentDotClass } from "../../../_internal/intent_classes.ts";

export function tabLabelString<T extends string, M>(
  item: ListItem<T, M>,
): string {
  return item.labelText ??
    (typeof item.label === "string" ? item.label : String(item.id));
}

// A horizontal tab is a text-only interactive: no hover surface, text colour
// carries the hover. The underline hugs the label (no horizontal padding;
// tabs are spaced by the strip's gap) and is an inset shadow, so it paints
// over the bottom of the tab instead of adding to its height.
export function horizontalTabClasses(active: boolean, size?: "sm"): string {
  const base =
    "ui-focusable relative flex items-center justify-center ui-gap-sm font-700 cursor-pointer select-none";
  const sizeClass = size === "sm" ? "text-sm" : "";
  if (active) {
    return `${base} ${sizeClass} text-primary ${
      size === "sm"
        ? "shadow-[inset_0_-2px_0_0_var(--color-primary)]"
        : "shadow-[inset_0_-3px_0_0_var(--color-primary)]"
    }`;
  }
  return `${base} ${sizeClass} text-base-content hover:text-primary`;
}

export function TabLabel<T extends string, M>(p: {
  item: ListItem<T, M>;
  text: string;
  vertical?: boolean;
}) {
  return (
    <>
      <div class="flex h-[1.25em] items-center gap-[0.75em]">
        <Show when={p.item.iconName}>
          <span class="h-[1.25em] w-[1.25em] flex-none">
            <IconRenderer iconName={p.item.iconName!} />
          </span>
        </Show>
        <span class="whitespace-nowrap leading-tight">{p.text}</span>
      </div>
      <Show when={p.item.badge !== undefined}>
        <span classList={{ "flex-none": p.vertical === true }}>
          <Badge intent="base-300">{p.item.badge}</Badge>
        </span>
      </Show>
      <Show when={p.item.dot}>
        <span class={intentDotClass(p.item.dot!)} />
      </Show>
    </>
  );
}
