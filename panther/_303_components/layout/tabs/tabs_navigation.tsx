// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import { IconRenderer } from "../../form_inputs/icon_renderer.tsx";
import { Tooltip } from "../../special_state/tooltip.tsx";
import { Badge } from "../../display/badge.tsx";
import { Button } from "../../form_inputs/mod.ts";
import type { Intent } from "../../types.ts";
import { type DataAttrs, splitDataAttrs } from "../../data_attrs.ts";
import type { ListItem } from "../../list_selection/list_item_types.ts";

type TabsNavigationProps<T extends string = string, M = never> = DataAttrs & {
  items: ListItem<T, M>[];
  value: T;
  onChange: (value: T) => void;
  tabLabelFormatter?: (item: ListItem<T, M>) => string;
  vertical?: boolean;
  // The three below are horizontal only. The strip is pure geometry: it
  // paints no surface of its own and never puts space below the rail.
  size?: "sm";
  // By default the strip carries ui-pad-x so it can be a FrameTop panel or
  // sit under a HeadingBar bare, with the first label at the content edge.
  // noPad is for a strip inside padded content (a ui-pad / ui-spy stack, a
  // modal body), where the parent's padding is the inset.
  noPad?: boolean;
  // Stops the rail at the strip's pad-x instead of running it to the panel
  // edge. Nothing to do with noPad: the rail already ends there.
  insetRail?: boolean;

  // Collapsible functionality (vertical only)
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

export function TabsNavigation<T extends string = string, M = never>(
  p: TabsNavigationProps<T, M>,
) {
  const [dataAttrs] = splitDataAttrs(p);
  const isVertical = () => p.vertical === true;
  const isCollapsed = () => p.collapsed === true && isVertical();
  const isCollapsible = () => p.collapsible === true && isVertical();
  const isSmall = () => p.size === "sm";
  const hasPadX = () => p.noPad !== true;

  const isActive = (id: T) => id === p.value;

  const handleToggleCollapse = () => {
    p.onCollapsedChange?.(!p.collapsed);
  };

  const getTabClasses = (id: T) => {
    if (!isVertical()) {
      // A tab label is a text-only interactive: no hover surface, text colour
      // carries the hover. The underline hugs the label (no horizontal
      // padding; tabs are spaced by the strip's gap). It is an inset shadow,
      // like the vertical mode's side accent, so it paints over the bottom of
      // the padding instead of adding to it; -mb-px overlaps the tab's bottom
      // pixel onto the rail so the underline sits on the line.
      const baseClasses =
        "ui-focusable relative -mb-px flex items-center justify-center ui-gap-sm font-700 cursor-pointer select-none";
      const sizeClasses = isSmall() ? "ui-pad-y-sm text-sm" : "ui-pad-y";

      if (isActive(id)) {
        return `${baseClasses} ${sizeClasses} text-primary ${
          isSmall()
            ? "shadow-[inset_0_-2px_0_0_var(--color-primary)]"
            : "shadow-[inset_0_-3px_0_0_var(--color-primary)]"
        }`;
      }
      return `${baseClasses} ${sizeClasses} text-base-content hover:text-primary`;
    } else {
      const gapClass = isCollapsed() ? "" : "gap-[0.75em]";
      const justifyClass = isCollapsed() ? "justify-center" : "justify-between";
      const paddingClass = isCollapsed() ? "pr-4 pl-5 py-4" : "py-4 pr-4 pl-5";
      const baseClasses =
        `ui-focusable relative flex items-center ${gapClass} ${justifyClass} ${paddingClass} w-full font-700 text-sm leading-tight cursor-pointer select-none`;

      if (isActive(id)) {
        return `${baseClasses} shadow-[inset_4px_0_0_0_var(--color-primary)] text-primary bg-base-200`;
      }
      // ui-hoverable-base-100, not the old hover:bg-base-100 — that was an
      // invisible hover on the sidebar's own base-100 background.
      return `${baseClasses} ui-hoverable-base-100 text-base-content hover:text-primary`;
    }
  };

  const labelString = (item: ListItem<T, M>) =>
    item.labelText ??
      (typeof item.label === "string" ? item.label : String(item.id));

  const formatter = (item: ListItem<T, M>) =>
    (p.tabLabelFormatter ?? labelString)(item);

  // Horizontal: the rail is the border-b of the strip (running through its
  // pad-x to the panel edge) or of the row (stopping at the pad-x); each
  // tab's -mb-px pulls its underline down onto that line either way.
  const railOnRow = () => hasPadX() && p.insetRail === true;

  const containerClasses = () =>
    !isVertical()
      ? `w-full ${railOnRow() ? "" : "border-b"} ${hasPadX() ? "ui-pad-x" : ""}`
      : "bg-base-100 flex w-full flex-col h-full";

  const rowClasses = () =>
    !isVertical()
      ? `flex ${railOnRow() ? "border-b" : ""} ${
        isSmall() ? "ui-gap" : "ui-gap-lg"
      }`
      : "flex-1 overflow-y-auto";

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
          <span classList={{ "flex-none": isVertical() }}>
            <Badge intent="base-300">{badge}</Badge>
          </span>
        </Show>
        <Show when={dot}>
          <span class={getDotClasses(dot!)} />
        </Show>
      </>
    );
  };

  return (
    <div {...dataAttrs} class={containerClasses()}>
      <div class={rowClasses()}>
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
      <Show when={isCollapsible()}>
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
