// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For } from "solid-js";
import type { Tabs } from "./get_tabs.ts";
import { SelectOption } from "../../form_inputs/types.ts";

interface TabsNavigationProps {
  tabs: Tabs;
  onTabClick?: (tab: string) => void;
  tabLabelFormatter?: (option: SelectOption<string>) => string;
  showBadge?: (tab: string) => string | number | undefined;
  vertical?: boolean;
}

export function TabsNavigation(p: TabsNavigationProps) {
  const handleTabClick = (tab: string) => {
    if (p.onTabClick) {
      p.onTabClick(tab);
    } else {
      p.tabs.setCurrentTab(() => tab);
    }
  };

  const getTabClasses = (tab: string) => {
    const isActive = p.tabs.isTabActive(tab);
    const isVertical = p.vertical === true;

    if (!isVertical) {
      const baseClasses =
        "ui-hoverable ui-focusable relative flex items-center justify-center ui-gap-sm ui-pad font-700 cursor-pointer border-b-4";

      if (isActive) {
        return `${baseClasses} border-primary text-primary bg-base-100`;
      }
      return `${baseClasses} border-transparent text-base-content hover:text-primary hover:border-base-300`;
    } else {
      const baseClasses =
        "ui-hoverable ui-focusable relative flex items-center justify-between w-full ui-pad font-400 cursor-pointer border-l-4";

      if (isActive) {
        return `${baseClasses} border-primary text-primary bg-base-200`;
      }
      return `${baseClasses} border-transparent text-base-content hover:text-primary hover:bg-base-100`;
    }
  };

  const formatter = p.tabLabelFormatter ??
    ((option: SelectOption<string>) =>
      typeof option.label === "string" ? option.label : String(option.value));

  const isVertical = p.vertical === true;
  const containerClasses = !isVertical
    ? "bg-base-100 flex w-full"
    : "bg-base-100 flex w-full flex-col";

  return (
    <div class={containerClasses}>
      <For each={p.tabs.tabs}>
        {(option) => {
          const badge = p.showBadge?.(option.value);
          return (
            <button
              type="button"
              class={getTabClasses(option.value)}
              onClick={() => handleTabClick(option.value)}
              aria-current={p.tabs.isTabActive(option.value)
                ? "page"
                : undefined}
              role="tab"
            >
              <span class="whitespace-nowrap">{formatter(option)}</span>
              {badge && (
                <span
                  class={`bg-base-300 text-base-content rounded-full px-2 py-0.5 text-xs ${
                    isVertical ? "flex-none" : ""
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        }}
      </For>
    </div>
  );
}
