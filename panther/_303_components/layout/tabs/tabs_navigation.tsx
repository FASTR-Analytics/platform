// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import type { Tabs } from "./get_tabs.ts";
import { SelectOption } from "../../form_inputs/types.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../../icons/mod.ts";
import { IconRenderer } from "../../form_inputs/icon_renderer.tsx";
import type { IconName } from "../../icons/mod.ts";
import { Tooltip } from "../../special_state/tooltip.tsx";
import { Button } from "../../form_inputs/mod.ts";
import type { Intent } from "../../types.ts";

interface TabsNavigationProps {
  tabs: Tabs;
  onTabClick?: (tab: string) => void;
  tabLabelFormatter?: (option: SelectOption<string>) => string;
  badges?: Record<string, string | number>;
  dots?: Record<string, Intent>;
  vertical?: boolean;

  // Collapsible functionality
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  icons?: Record<string, IconName>;
  defaultIcon?: IconName;
}

export function TabsNavigation(p: TabsNavigationProps) {
  const isVertical = p.vertical === true;
  const isCollapsed = () => p.collapsed === true && isVertical;
  const isCollapsible = p.collapsible === true && isVertical;

  const handleTabClick = (tab: string) => {
    if (p.onTabClick) {
      p.onTabClick(tab);
    } else {
      p.tabs.setCurrentTab(() => tab);
    }
  };

  const handleToggleCollapse = () => {
    p.onCollapsedChange?.(!p.collapsed);
  };

  // Icons are opt-in. Return undefined when the caller hasn't configured
  // any, so callers without icon intent don't get a surprise chevron.
  // Exception: the collapsed vertical mode is icon-only, so it falls back
  // to chevronRight where no icon is otherwise provided — handled at the
  // render site below.
  const getIcon = (tabValue: string): IconName | undefined => {
    if (p.icons?.[tabValue]) {
      return p.icons[tabValue];
    }
    return p.defaultIcon;
  };

  const getTabClasses = (tab: string) => {
    const isActive = p.tabs.isTabActive(tab);

    if (!isVertical) {
      // Horizontal tabs render their own bottom border, which overlaps the
      // container's continuous underline (see containerClasses + rowClasses
      // below for the -mb-px trick). Active tab covers with primary; inactive
      // tab is transparent so the container line shows through — producing a
      // single clean rail across the whole tab strip.
      const baseClasses =
        "ui-hoverable ui-focusable relative flex items-center justify-center ui-gap-sm ui-pad font-700 cursor-pointer border-b-2";

      if (isActive) {
        return `${baseClasses} border-primary text-primary bg-base-100`;
      }
      return `${baseClasses} border-transparent text-base-content hover:text-primary hover:border-primary/40`;
    } else {
      // Vertical tabs - match original wb-fastr styling
      const gapClass = isCollapsed() ? "" : "gap-[0.75em]";
      const justifyClass = isCollapsed() ? "justify-center" : "justify-between";
      const paddingClass = isCollapsed() ? "pr-4 pl-5 py-4" : "py-4 pr-4 pl-5";
      const baseClasses = `ui-hoverable ui-focusable relative flex items-center ${gapClass} ${justifyClass} ${paddingClass} w-full font-700 text-sm leading-tight cursor-pointer`;

      if (isActive) {
        return `${baseClasses} shadow-[inset_4px_0_0_0_var(--color-primary)] text-primary bg-base-200`;
      }
      return `${baseClasses} text-base-content hover:text-primary hover:bg-base-100`;
    }
  };

  const formatter =
    p.tabLabelFormatter ??
    ((option: SelectOption<string>) =>
      typeof option.label === "string" ? option.label : String(option.value));

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

  const renderTabContent = (option: SelectOption<string>) => {
    const badge = () => p.badges?.[option.value];
    const dotIntent = () => p.dots?.[option.value];
    const icon = getIcon(option.value);

    if (isCollapsed()) {
      return (
        <span class="relative flex h-[1.25em] w-[1.25em] flex-none items-center">
          <IconRenderer iconName={icon ?? "chevronRight"} />
          <Show when={dotIntent()}>
            <span
              class={`${getDotClasses(dotIntent()!)} absolute -right-2 -top-1`}
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
            {formatter(option)}
          </span>
        </div>
        <Show when={badge()}>
          <span
            class={`bg-base-300 text-base-content rounded-full px-2 py-0.5 text-xs ${
              isVertical ? "flex-none" : ""
            }`}
          >
            {badge()}
          </span>
        </Show>
        <Show when={dotIntent()}>
          <span class={getDotClasses(dotIntent()!)} />
        </Show>
      </>
    );
  };

  return (
    <div class={containerClasses}>
      <div class={rowClasses}>
        <For each={p.tabs.tabs}>
          {(option) => {
            const tooltipContent =
              typeof option.label === "string"
                ? option.label
                : String(option.value);

            // Wrap with tooltip when collapsed - use Show for reactivity
            return (
              <Show
                when={isCollapsed()}
                fallback={
                  <button
                    type="button"
                    class={getTabClasses(option.value)}
                    onClick={() => handleTabClick(option.value)}
                    aria-current={
                      p.tabs.isTabActive(option.value) ? "page" : undefined
                    }
                    role="tab"
                  >
                    {renderTabContent(option)}
                  </button>
                }
              >
                <Tooltip content={tooltipContent} position="right">
                  <button
                    type="button"
                    class={getTabClasses(option.value)}
                    onClick={() => handleTabClick(option.value)}
                    aria-current={
                      p.tabs.isTabActive(option.value) ? "page" : undefined
                    }
                    role="tab"
                  >
                    {renderTabContent(option)}
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
            aria-label={
              isCollapsed() ? "Expand navigation" : "Collapse navigation"
            }
            outline
            iconName={isCollapsed() ? "chevronRight" : "chevronLeft"}
            intent="neutral"
          ></Button>
        </div>
      </Show>
    </div>
  );
}
