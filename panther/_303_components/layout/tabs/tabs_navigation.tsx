// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import { IconRenderer } from "../../form_inputs/icon_renderer.tsx";
import { Tooltip } from "../../special_state/tooltip.tsx";
import { Button } from "../../form_inputs/mod.ts";
import type { Intent } from "../../types.ts";
import type { ListItem } from "../../list_selection/list_item_types.ts";

interface TabsNavigationProps<T extends string = string, M = never> {
  items: ListItem<T, M>[];
  value: T;
  onChange: (value: T) => void;
  tabLabelFormatter?: (item: ListItem<T, M>) => string;
  vertical?: boolean;

  // Collapsible functionality (vertical only)
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function TabsNavigation<T extends string = string, M = never>(
  p: TabsNavigationProps<T, M>,
) {
  const isVertical = p.vertical === true;
  const isCollapsed = () => p.collapsed === true && isVertical;
  const isCollapsible = p.collapsible === true && isVertical;

  const isActive = (id: T) => id === p.value;

  const handleToggleCollapse = () => {
    p.onCollapsedChange?.(!p.collapsed);
  };

  const getTabClasses = (id: T) => {
    if (!isVertical) {
      // Horizontal tabs render their own bottom border, which overlaps the
      // container's continuous underline (see containerClasses + rowClasses
      // below for the -mb-px trick). Active tab covers with primary; inactive
      // tab is transparent so the container line shows through — producing a
      // single clean rail across the whole tab strip.
      const baseClasses =
        "ui-hoverable ui-focusable relative flex items-center justify-center ui-gap-sm ui-pad font-700 cursor-pointer border-b-2";

      if (isActive(id)) {
        return `${baseClasses} border-primary text-primary bg-base-100`;
      }
      return `${baseClasses} border-transparent text-base-content hover:text-primary hover:border-primary/40`;
    } else {
      const gapClass = isCollapsed() ? "" : "gap-[0.75em]";
      const justifyClass = isCollapsed() ? "justify-center" : "justify-between";
      const paddingClass = isCollapsed() ? "pr-4 pl-5 py-4" : "py-4 pr-4 pl-5";
      const baseClasses =
        `ui-hoverable ui-focusable relative flex items-center ${gapClass} ${justifyClass} ${paddingClass} w-full font-700 text-sm leading-tight cursor-pointer`;

      if (isActive(id)) {
        return `${baseClasses} shadow-[inset_4px_0_0_0_var(--color-primary)] text-primary bg-base-200`;
      }
      return `${baseClasses} text-base-content hover:text-primary hover:bg-base-100`;
    }
  };

  const labelString = (item: ListItem<T, M>) =>
    item.labelText ??
      (typeof item.label === "string" ? item.label : String(item.id));

  const formatter = p.tabLabelFormatter ?? labelString;

  const containerClasses = !isVertical
    ? "bg-base-100 w-full border-b border-base-300"
    : "bg-base-100 flex w-full flex-col h-full";

  // Horizontal: -mb-px pulls the tab row up 1px so each tab's border-b-2
  // sits on top of the container's border-b — continuous underline with
  // the active tab's primary border overlaying it.
  const rowClasses = !isVertical ? "-mb-px flex" : "flex-1 overflow-y-auto";

  const getDotClasses = (intent: Intent) => {
    const base = "h-2 w-2 rounded-full flex-none";
    switch (intent) {
      case "primary":
        return `${base} bg-primary`;
      case "success":
        return `${base} bg-success`;
      case "warning":
        return `${base} bg-warning`;
      case "danger":
        return `${base} bg-danger`;
      case "neutral":
        return `${base} bg-neutral`;
      case "base-content":
        return `${base} bg-base-content`;
      case "base-100":
        return `${base} bg-base-100`;
    }
  };

  const renderTabContent = (item: ListItem<T, M>) => {
    const badge = item.badge;
    const dot = item.dot;
    const icon = item.iconName;

    if (isCollapsed()) {
      return (
        <span class="relative flex h-[1.25em] w-[1.25em] flex-none items-center">
          <IconRenderer iconName={icon ?? "chevronRight"} />
          <Show when={dot}>
            <span
              class={`${getDotClasses(dot!)} absolute -right-2 -top-1`}
            />
          </Show>
        </span>
      );
    }

    // Expanded mode: optional icon + label + badge/dot
    return (
      <>
        <div class="flex h-[1.25em] items-center gap-[0.75em]">
          <Show when={icon}>
            <span class="h-[1.25em] w-[1.25em] flex-none">
              <IconRenderer iconName={icon!} />
            </span>
          </Show>
          <span class="whitespace-nowrap leading-tight">
            {formatter(item)}
          </span>
        </div>
        <Show when={badge !== undefined}>
          <span
            class={`bg-base-300 text-base-content rounded-full px-2 py-0.5 text-xs ${
              isVertical ? "flex-none" : ""
            }`}
          >
            {badge}
          </span>
        </Show>
        <Show when={dot}>
          <span class={getDotClasses(dot!)} />
        </Show>
      </>
    );
  };

  return (
    <div class={containerClasses}>
      <div class={rowClasses}>
        <For each={p.items}>
          {(item) => {
            return (
              <Show
                when={isCollapsed()}
                fallback={
                  <button
                    type="button"
                    class={getTabClasses(item.id)}
                    onClick={() => p.onChange(item.id)}
                    aria-current={isActive(item.id) ? "page" : undefined}
                    role="tab"
                  >
                    {renderTabContent(item)}
                  </button>
                }
              >
                <Tooltip content={labelString(item)} position="right">
                  <button
                    type="button"
                    class={getTabClasses(item.id)}
                    onClick={() => p.onChange(item.id)}
                    aria-current={isActive(item.id) ? "page" : undefined}
                    role="tab"
                  >
                    {renderTabContent(item)}
                  </button>
                </Tooltip>
              </Show>
            );
          }}
        </For>
      </div>

      {/* Collapse toggle button - styled as icon button with outline */}
      <Show when={isCollapsible}>
        <div
          class="flex items-center py-4"
          classList={{
            "justify-center": isCollapsed(),
            "pl-4": !isCollapsed(),
          }}
        >
          <Button
            onClick={handleToggleCollapse}
            aria-label={isCollapsed()
              ? "Expand navigation"
              : "Collapse navigation"}
            outline
            iconName={isCollapsed() ? "chevronRight" : "chevronLeft"}
            intent="neutral"
          >
          </Button>
        </div>
      </Show>
    </div>
  );
}
