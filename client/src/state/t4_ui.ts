import { createSignal } from "solid-js";
import type {
  ModuleLatestCommit,
  ReportGroupingMode,
  SlideDeckGroupingMode,
  SlideType,
  SortMode,
  VisualizationGroupingMode,
} from "lib";

// ============================================================================
// Project View State
// ============================================================================

// Active tab selection
const ALL_TAB_OPTIONS = [
  "reports",
  "decks",
  "dashboards",
  "visualizations",
  "metrics",
  "modules",
  "data",
  "settings",
  "cache",
] as const;

export type TabOption = (typeof ALL_TAB_OPTIONS)[number];

// Checked, unlike the sort/grouping modes below: this is the one stored value
// that feeds a lookup which THROWS on a miss (PROJECT_TAB_TO_VIEW ->
// panther's setView, from a mount effect with no ErrorBoundary above it, so
// the throw also skips every effect queued after it). A value written by a
// build that spelled a tab differently would take the project page down with
// no error surface; the modes below only feed comparisons and degrade.
const storedTab = localStorage.getItem("projectTab");
const initialTab: TabOption =
  storedTab !== null &&
  (ALL_TAB_OPTIONS as readonly string[]).includes(storedTab)
    ? (storedTab as TabOption)
    : "visualizations";

export const [projectTab, setProjectTabInternal] =
  createSignal<TabOption>(initialTab);

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
const storedProjectsSortMode = localStorage.getItem(
  "projectsSortMode",
) as SortMode | null;
export const [projectsSortMode, setProjectsSortModeInternal] =
  createSignal<SortMode>(storedProjectsSortMode ?? "name");
export function setProjectsSortMode(mode: SortMode) {
  localStorage.setItem("projectsSortMode", mode);
  setProjectsSortModeInternal(mode);
}

const storedVizSortMode = localStorage.getItem(
  "vizSortMode",
) as SortMode | null;
export const [vizSortMode, setVizSortModeInternal] = createSignal<SortMode>(
  storedVizSortMode ?? "name",
);
export function setVizSortMode(mode: SortMode) {
  localStorage.setItem("vizSortMode", mode);
  setVizSortModeInternal(mode);
}

const storedDeckSortMode = localStorage.getItem(
  "deckSortMode",
) as SortMode | null;
export const [deckSortMode, setDeckSortModeInternal] = createSignal<SortMode>(
  storedDeckSortMode ?? "recent",
);
export function setDeckSortMode(mode: SortMode) {
  localStorage.setItem("deckSortMode", mode);
  setDeckSortModeInternal(mode);
}

const storedReportSortMode = localStorage.getItem(
  "reportSortMode",
) as SortMode | null;
export const [reportSortMode, setReportSortModeInternal] =
  createSignal<SortMode>(storedReportSortMode ?? "recent");
export function setReportSortMode(mode: SortMode) {
  localStorage.setItem("reportSortMode", mode);
  setReportSortModeInternal(mode);
}

const storedDashboardSortMode = localStorage.getItem(
  "dashboardSortMode",
) as SortMode | null;
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
  if (updates.showModules !== undefined) {
    setShowModules(updates.showModules);
  }
}

// ============================================================================
// Appearance
// ============================================================================

// Applied at module scope so the stored theme is on <html> before first paint
const storedDarkMode = localStorage.getItem("darkMode") === "true";

export const [darkMode, setDarkModeInternal] =
  createSignal<boolean>(storedDarkMode);

export function setDarkMode(value: boolean) {
  localStorage.setItem("darkMode", String(value));
  setDarkModeInternal(value);
  applyThemeToDocument(value);
}

function applyThemeToDocument(dark: boolean) {
  if (dark) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

applyThemeToDocument(storedDarkMode);

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

// ============================================================================
// Module Display
// ============================================================================

export const [showModules, setShowModules] = createSignal<string | undefined>(
  "m001",
);

// ============================================================================
// Module Update Status
// ============================================================================

export const [moduleLatestCommits, setModuleLatestCommits] = createSignal<
  ModuleLatestCommit[] | undefined
>(undefined);

// ============================================================================
// Editor-open flags
// ============================================================================

// The dashboard editor renders as an overlay over the still-mounted project
// shell and (unlike the deck/report/viz editors) sets no AI view, so nothing
// outside it can tell it is open. Onboarding tours read this to know which
// page the user is actually looking at.
export const [dashboardEditorOpen, setDashboardEditorOpen] =
  createSignal<boolean>(false);

// Request signal for opening a document editor from outside the tab
// components (the tour catalogue modal). The openers live in private closures
// inside each tab component, and inactive tabs are unmounted, so the request
// must persist until the matching tab mounts and consumes it. Consumers clear
// the signal BEFORE calling their opener (openProjectEditor only resolves when
// the editor closes).
export type PendingEditorOpen = {
  kind: "deck" | "report" | "visualization" | "dashboard";
  id: string;
};
export const [pendingEditorOpen, setPendingEditorOpen] =
  createSignal<PendingEditorOpen | null>(null);

// Second level of the same pattern: set alongside a pending "deck" request by
// the tour catalogue's slide-tour replays, consumed by the deck editor once
// its slides have loaded — it opens the first slide of this type.
export const [pendingSlideOpen, setPendingSlideOpen] =
  createSignal<SlideType | null>(null);

// Top level of the chain: a tour replay requested from the instance-level
// catalogue before any project shell exists. Set together with navigation to
// `/?p=<projectId>`; the project shell consumes it after hydration and runs
// the tour's own navigate + start.
export const [pendingTourReplay, setPendingTourReplay] = createSignal<
  string | null
>(null);
