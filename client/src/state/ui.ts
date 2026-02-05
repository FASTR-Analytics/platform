import { createSignal } from "solid-js";
import type { VisualizationGroupingMode } from "lib";

// ============================================================================
// Project View State
// ============================================================================

// Active tab selection
export type TabOption = "chatbot" | "whiteboard" | "reports" | "decks" | "visualizations" | "metrics" | "modules" | "data" | "settings";

const storedTab = localStorage.getItem("projectTab") as TabOption | null;

export const [projectTab, setProjectTabInternal] = createSignal<TabOption>(
  storedTab ?? "whiteboard"
);

export function setProjectTab(tab: TabOption) {
  localStorage.setItem("projectTab", tab);
  setProjectTabInternal(tab);
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

// Consolidated updater for project view state
export type ProjectViewStateUpdates = {
  tab?: TabOption;
  vizGroupingMode?: VisualizationGroupingMode;
  vizSelectedGroup?: string | null;
  hideUnreadyVisualizations?: boolean;
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

export const [showAi, setShowAi] = createSignal<boolean>(false);

// ============================================================================
// Slide/Report Editor State
// ============================================================================

export const [headerOrContent, setHeaderOrContent] = createSignal<"slideHeader" | "content">("content");

export const [policyHeaderOrContent, setPolicyHeaderOrContent] = createSignal<"policyHeaderFooter" | "content">("content");

// ============================================================================
// Module Display
// ============================================================================

export const [showModules, setShowModules] = createSignal<string | undefined>("m001");
