import { createSignal } from "solid-js";
import type {
  ReportGroupingMode,
  SlideDeckGroupingMode,
  SortMode,
  VisualizationGroupingMode,
} from "lib";

// ============================================================================
// Project View State
// ============================================================================

// Active tab selection
export type TabOption =
  | "reports"
  | "decks"
  | "dashboards"
  | "visualizations"
  | "metrics"
  | "results_package"
  | "settings"
  | "cache";

const _TAB_OPTIONS: readonly TabOption[] = [
  "reports",
  "decks",
  "dashboards",
  "visualizations",
  "metrics",
  "results_package",
  "settings",
  "cache",
];

// Stored prefs may hold a tab that no longer exists (e.g. the removed
// "modules"/"data" tabs) — fall back rather than selecting nothing.
const rawStoredTab = localStorage.getItem("projectTab");
const storedTab = _TAB_OPTIONS.includes(rawStoredTab as TabOption)
  ? (rawStoredTab as TabOption)
  : null;

export const [projectTab, setProjectTabInternal] = createSignal<TabOption>(
  storedTab ?? "visualizations",
);

export function setProjectTab(tab: TabOption) {
  localStorage.setItem("projectTab", tab);
  setProjectTabInternal(tab);
}

// Project navigation collapsed state
const storedNavCollapsed = localStorage.getItem("navCollapsed");

export const [navCollapsed, setNavCollapsedInternal] = createSignal<boolean>(
  storedNavCollapsed === null ? true : storedNavCollapsed === "true",
);

export function setNavCollapsed(collapsed: boolean) {
  localStorage.setItem("navCollapsed", String(collapsed));
  setNavCollapsedInternal(collapsed);
}

// List sort modes (defaults chosen to match each list's current server order)
const storedProjectsSortMode = localStorage.getItem("projectsSortMode") as SortMode | null;
export const [projectsSortMode, setProjectsSortModeInternal] =
  createSignal<SortMode>(storedProjectsSortMode ?? "name");
export function setProjectsSortMode(mode: SortMode) {
  localStorage.setItem("projectsSortMode", mode);
  setProjectsSortModeInternal(mode);
}

const storedVizSortMode = localStorage.getItem("vizSortMode") as SortMode | null;
export const [vizSortMode, setVizSortModeInternal] =
  createSignal<SortMode>(storedVizSortMode ?? "name");
export function setVizSortMode(mode: SortMode) {
  localStorage.setItem("vizSortMode", mode);
  setVizSortModeInternal(mode);
}

const storedDeckSortMode = localStorage.getItem("deckSortMode") as SortMode | null;
export const [deckSortMode, setDeckSortModeInternal] =
  createSignal<SortMode>(storedDeckSortMode ?? "recent");
export function setDeckSortMode(mode: SortMode) {
  localStorage.setItem("deckSortMode", mode);
  setDeckSortModeInternal(mode);
}

const storedReportSortMode = localStorage.getItem("reportSortMode") as SortMode | null;
export const [reportSortMode, setReportSortModeInternal] =
  createSignal<SortMode>(storedReportSortMode ?? "recent");
export function setReportSortMode(mode: SortMode) {
  localStorage.setItem("reportSortMode", mode);
  setReportSortModeInternal(mode);
}

const storedDashboardSortMode = localStorage.getItem("dashboardSortMode") as SortMode | null;
export const [dashboardSortMode, setDashboardSortModeInternal] =
  createSignal<SortMode>(storedDashboardSortMode ?? "recent");
export function setDashboardSortMode(mode: SortMode) {
  localStorage.setItem("dashboardSortMode", mode);
  setDashboardSortModeInternal(mode);
}

// Visualization grouping/filtering
const storedGroupingMode = localStorage.getItem(
  "vizGroupingMode",
) as VisualizationGroupingMode | null;

export const [vizGroupingMode, setVizGroupingModeInternal] =
  createSignal<VisualizationGroupingMode>(storedGroupingMode ?? "folders");

export function setVizGroupingMode(mode: VisualizationGroupingMode) {
  localStorage.setItem("vizGroupingMode", mode);
  setVizGroupingModeInternal(mode);
}

const storedSelectedGroup = localStorage.getItem("vizSelectedGroup");

export const [vizSelectedGroup, setVizSelectedGroupInternal] = createSignal<
  string | null
>(storedSelectedGroup);

export function setVizSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("vizSelectedGroup");
  } else {
    localStorage.setItem("vizSelectedGroup", group);
  }
  setVizSelectedGroupInternal(group);
}

const storedHideUnreadyViz =
  localStorage.getItem("hideUnreadyVisualizations") === "true";

export const [hideUnreadyVisualizations, setHideUnreadyVisualizationsInternal] =
  createSignal<boolean>(storedHideUnreadyViz);

export function setHideUnreadyVisualizations(value: boolean) {
  localStorage.setItem("hideUnreadyVisualizations", value.toString());
  setHideUnreadyVisualizationsInternal(value);
}

// Slide deck grouping/filtering
const storedDeckGroupingMode = localStorage.getItem(
  "deckGroupingMode",
) as SlideDeckGroupingMode | null;

export const [deckGroupingMode, setDeckGroupingModeInternal] =
  createSignal<SlideDeckGroupingMode>(storedDeckGroupingMode ?? "folders");

export function setDeckGroupingMode(mode: SlideDeckGroupingMode) {
  localStorage.setItem("deckGroupingMode", mode);
  setDeckGroupingModeInternal(mode);
}

const storedDeckSelectedGroup = localStorage.getItem("deckSelectedGroup");

export const [deckSelectedGroup, setDeckSelectedGroupInternal] = createSignal<
  string | null
>(storedDeckSelectedGroup);

export function setDeckSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("deckSelectedGroup");
  } else {
    localStorage.setItem("deckSelectedGroup", group);
  }
  setDeckSelectedGroupInternal(group);
}

// Report grouping/filtering
const storedReportGroupingMode = localStorage.getItem(
  "reportGroupingMode",
) as ReportGroupingMode | null;

export const [reportGroupingMode, setReportGroupingModeInternal] =
  createSignal<ReportGroupingMode>(storedReportGroupingMode ?? "folders");

export function setReportGroupingMode(mode: ReportGroupingMode) {
  localStorage.setItem("reportGroupingMode", mode);
  setReportGroupingModeInternal(mode);
}

const storedReportSelectedGroup = localStorage.getItem("reportSelectedGroup");

export const [reportSelectedGroup, setReportSelectedGroupInternal] =
  createSignal<string | null>(storedReportSelectedGroup);

export function setReportSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("reportSelectedGroup");
  } else {
    localStorage.setItem("reportSelectedGroup", group);
  }
  setReportSelectedGroupInternal(group);
}

// Consolidated updater for project view state
export type ProjectViewStateUpdates = {
  tab?: TabOption;
  vizGroupingMode?: VisualizationGroupingMode;
  vizSelectedGroup?: string | null;
  hideUnreadyVisualizations?: boolean;
  deckGroupingMode?: SlideDeckGroupingMode;
  deckSelectedGroup?: string | null;
  reportGroupingMode?: ReportGroupingMode;
  reportSelectedGroup?: string | null;
  fitWithin?: "fit-within" | "fit-width";
  showAi?: boolean;
  headerOrContent?: "slideHeader" | "content";
  policyHeaderOrContent?: "policyHeaderFooter" | "content";
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
  if (updates.reportGroupingMode !== undefined) {
    setReportGroupingMode(updates.reportGroupingMode);
  }
  if (updates.reportSelectedGroup !== undefined) {
    setReportSelectedGroup(updates.reportSelectedGroup);
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
}

// ============================================================================
// Chart/Viz Display Settings
// ============================================================================

export const [fitWithin, setFitWithin] = createSignal<
  "fit-within" | "fit-width"
>("fit-within");

// ============================================================================
// AI Settings
// ============================================================================

export const [showAi, setShowAi] = createSignal<boolean>(false);

// ============================================================================
// Slide/Report Editor State
// ============================================================================

export const [headerOrContent, setHeaderOrContent] = createSignal<
  "slideHeader" | "content"
>("content");

export const [policyHeaderOrContent, setPolicyHeaderOrContent] = createSignal<
  "policyHeaderFooter" | "content"
>("content");

