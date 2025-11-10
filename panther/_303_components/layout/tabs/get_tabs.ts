// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Accessor, createSignal } from "solid-js";
import { SelectOption } from "../../form_inputs/types.ts";

export interface GetTabsOptions {
  initialTab?: string;
  onTabChange?: (tab: string) => void;
}

export interface Tabs {
  currentTab: Accessor<string>;
  setCurrentTab: (tab: string | ((prev: string) => string)) => void;
  tabs: SelectOption<string>[];
  isTabActive: (tab: string) => boolean;
  getAllTabs: () => string[];
}

export function getTabs(
  tabs: SelectOption<string>[],
  options?: GetTabsOptions,
): Tabs {
  if (tabs.length === 0) {
    throw new Error("getTabs requires at least one tab");
  }

  const initialTab = options?.initialTab ?? tabs[0].value;
  const [currentTab, setCurrentTab] = createSignal(initialTab);

  const handleSetCurrentTab = (tab: string | ((prev: string) => string)) => {
    const newTab = typeof tab === "function" ? tab(currentTab()) : tab;
    setCurrentTab(newTab);
    options?.onTabChange?.(newTab);
  };

  const isTabActive = (tab: string): boolean => {
    return currentTab() === tab;
  };

  const getAllTabs = (): string[] => {
    return tabs.map((tab) => tab.value);
  };

  return {
    currentTab,
    setCurrentTab: handleSetCurrentTab,
    tabs,
    isTabActive,
    getAllTabs,
  };
}
