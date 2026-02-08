import { createSignal } from "solid-js";
import type { SlideDeckGroupingMode, VisualizationGroupingMode } from "lib";

// ============================================================================
// Project View State
// ============================================================================

// Active tab selection
export type TabOption = "reports" | "decks" | "visualizations" | "metrics" | "modules" | "data" | "settings";

const storedTab = localStorage.getItem("projectTab") as TabOption | null;

export const [projectTab, setProjectTabInternal] = createSignal<TabOption>(
  storedTab ?? "visualizations"
);

export function setProjectTab(tab: TabOption) {
  localStorage.setItem("projectTab", tab);
  setProjectTabInternal(tab);
}

// Project navigation collapsed state
const storedNavCollapsed = localStorage.getItem("navCollapsed") === "true";

export const [navCollapsed, setNavCollapsedInternal] = createSignal<boolean>(
  storedNavCollapsed ?? true
);

export function setNavCollapsed(collapsed: boolean) {
  localStorage.setItem("navCollapsed", String(collapsed));
  setNavCollapsedInternal(collapsed);
}

// Visualization grouping/filtering
const storedGroupingMode = localStorage.getItem("vizGroupingMode") as VisualizationGroupingMode | null;

export const [vizGroupingMode, setVizGroupingModeInternal] = createSignal<VisualizationGroupingMode>(
  storedGroupingMode ?? "folders"
);

export function setVizGroupingMode(mode: VisualizationGroupingMode) {
  localStorage.setItem("vizGroupingMode", mode);
  setVizGroupingModeInternal(mode);
}

const storedSelectedGroup = localStorage.getItem("vizSelectedGroup");

export const [vizSelectedGroup, setVizSelectedGroupInternal] = createSignal<string | null>(
  storedSelectedGroup
);

export function setVizSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("vizSelectedGroup");
  } else {
    localStorage.setItem("vizSelectedGroup", group);
  }
  setVizSelectedGroupInternal(group);
}

const storedHideUnreadyViz = localStorage.getItem("hideUnreadyVisualizations") === "true";

export const [hideUnreadyVisualizations, setHideUnreadyVisualizationsInternal] = createSignal<boolean>(
  storedHideUnreadyViz
);

export function setHideUnreadyVisualizations(value: boolean) {
  localStorage.setItem("hideUnreadyVisualizations", value.toString());
  setHideUnreadyVisualizationsInternal(value);
}

// Slide deck grouping/filtering
const storedDeckGroupingMode = localStorage.getItem("deckGroupingMode") as SlideDeckGroupingMode | null;

export const [deckGroupingMode, setDeckGroupingModeInternal] = createSignal<SlideDeckGroupingMode>(
  storedDeckGroupingMode ?? "folders"
);

export function setDeckGroupingMode(mode: SlideDeckGroupingMode) {
  localStorage.setItem("deckGroupingMode", mode);
  setDeckGroupingModeInternal(mode);
}

const storedDeckSelectedGroup = localStorage.getItem("deckSelectedGroup");

export const [deckSelectedGroup, setDeckSelectedGroupInternal] = createSignal<string | null>(
  storedDeckSelectedGroup
);

export function setDeckSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("deckSelectedGroup");
  } else {
    localStorage.setItem("deckSelectedGroup", group);
  }
  setDeckSelectedGroupInternal(group);
}

// Consolidated updater for project view state
export type ProjectViewStateUpdates = {
  tab?: TabOption;
  vizGroupingMode?: VisualizationGroupingMode;
  vizSelectedGroup?: string | null;
  hideUnreadyVisualizations?: boolean;
  deckGroupingMode?: SlideDeckGroupingMode;
  deckSelectedGroup?: string | null;
  fitWithin?: "fit-within" | "fit-width";
  showAi?: boolean;
  headerOrContent?: "slideHeader" | "content";
  policyHeaderOrContent?: "policyHeaderFooter" | "content";
  showModules?: string | undefined;
};

export function updateProjectView(updates: ProjectViewStateUpdates) {
  if (updates.tab !== undefined) {
    setProjectTab(updates.tab);
  }
  if (updates.vizGroupingMode !== undefined) {
    setVizGroupingMode(updates.vizGroupingMode);
  }
  if (updates.vizSelectedGroup !== undefined) {
    setVizSelectedGroup(updates.vizSelectedGroup);
  }
  if (updates.hideUnreadyVisualizations !== undefined) {
    setHideUnreadyVisualizations(updates.hideUnreadyVisualizations);
  }
  if (updates.deckGroupingMode !== undefined) {
    setDeckGroupingMode(updates.deckGroupingMode);
  }
  if (updates.deckSelectedGroup !== undefined) {
    setDeckSelectedGroup(updates.deckSelectedGroup);
  }
  if (updates.fitWithin !== undefined) {
    setFitWithin(updates.fitWithin);
  }
  if (updates.showAi !== undefined) {
    setShowAi(updates.showAi);
  }
  if (updates.headerOrContent !== undefined) {
    setHeaderOrContent(updates.headerOrContent);
  }
  if (updates.policyHeaderOrContent !== undefined) {
    setPolicyHeaderOrContent(updates.policyHeaderOrContent);
  }
  if (updates.showModules !== undefined) {
    setShowModules(updates.showModules);
  }
}

// ============================================================================
// Chart/Viz Display Settings
// ============================================================================

export const [fitWithin, setFitWithin] = createSignal<"fit-within" | "fit-width">("fit-within");

// ============================================================================
// AI Settings
// ============================================================================

export const [showAi, setShowAi] = createSignal<boolean>(true);

// ============================================================================
// Slide/Report Editor State
// ============================================================================

export const [headerOrContent, setHeaderOrContent] = createSignal<"slideHeader" | "content">("content");

export const [policyHeaderOrContent, setPolicyHeaderOrContent] = createSignal<"policyHeaderFooter" | "content">("content");

// ============================================================================
// Module Display
// ============================================================================

export const [showModules, setShowModules] = createSignal<string | undefined>("m001");
