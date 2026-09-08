import { createSignal } from "solid-js";
import {
  effectiveScheme,
  type SchemePreference,
  setSchemePreference,
} from "panther";
import type { SlideType, SortMode, VisualizationGroupingMode } from "lib";

// ============================================================================
// Project View State
// ============================================================================

// Active tab selection
const ALL_TAB_OPTIONS = [
  "dashboards",
  "visualizations",
  "metrics",
  "results_package",
  "settings",
  "cache",
] as const;

export type TabOption = (typeof ALL_TAB_OPTIONS)[number];

// Checked, unlike the sort/grouping modes below: this is the one stored value
// that feeds a lookup which THROWS on a miss (PROJECT_TAB_TO_VIEW ->
// panther's setView, from a mount effect with no ErrorBoundary above it, so
// the throw also skips every effect queued after it). A value written by a
// build that spelled a tab differently, or holding a removed tab like
// "modules"/"data", would take the project page down with no error surface;
// the modes below only feed comparisons and degrade.
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
}

// ============================================================================
// Appearance
// ============================================================================

// Tri-state scheme preference on panther's data-scheme contract: "system"
// follows the OS, "light"/"dark" pin. Legacy migration: the old boolean
// "darkMode" key maps true -> "dark", explicit false -> "light"; users who
// never touched the old toggle (no key) get "system".
const storedScheme = localStorage.getItem("scheme");
const legacyDarkMode = localStorage.getItem("darkMode");
const initialScheme: SchemePreference =
  storedScheme === "system" ||
  storedScheme === "light" ||
  storedScheme === "dark"
    ? storedScheme
    : legacyDarkMode === "true"
      ? "dark"
      : legacyDarkMode === "false"
        ? "light"
        : "system";

export const [schemePref, setSchemePrefInternal] =
  createSignal<SchemePreference>(initialScheme);

export function setScheme(pref: SchemePreference) {
  localStorage.setItem("scheme", pref);
  setSchemePrefInternal(pref);
  setSchemePreference(pref);
}

// Resolved scheme as rendered, for JS consumers (CM highlight extensions,
// diff tints, Clerk appearance). Reactive through panther's signal.
export const darkMode = () => effectiveScheme() === "dark";

// Applied at module scope so the stored scheme is on <html> before first paint
setSchemePreference(initialScheme);

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
// Editor-open flags
// ============================================================================

// The dashboard editor renders as an overlay over the still-mounted project
// shell and (unlike the deck/report/viz editors) sets no AI view, so nothing
// outside it can tell it is open. Onboarding tours read this to know which
// page the user is actually looking at.
export const [dashboardEditorOpen, setDashboardEditorOpen] =
  createSignal<boolean>(false);

// The project results-package tab fetches its attached package on mount
// instead of reading a store, so its tour anchors appear a network
// round-trip after the tab itself does. This counts its settled fetches
// (ready OR error; 0 while the first is in flight, reset to 0 on unmount).
// The onboarding manager counts the tab as visible only while this is > 0,
// so tour parts gated on those anchors are evaluated against the drawn page
// rather than the loading one: evaluating at tab-entry excluded them, and
// nothing re-checked once the fetch landed. A count rather than a flag so
// that every later settle (a repoint) is a re-check too: a part that only
// became possible mid-visit starts as soon as its anchor is on screen.
export const [resultsPackageTabLoadCount, setResultsPackageTabLoadCount] =
  createSignal<number>(0);

// Request signal for opening an editor from outside the page that owns it
// (the tour catalogue modal, the copilot, a deep link). The openers live in
// private closures inside each page, and inactive pages are unmounted, so
// the request must persist until the matching page mounts and consumes it.
// Consumers clear the signal BEFORE calling their opener (the editor promise
// only resolves when the editor closes). `product` is consumed by the
// Products page; the two project kinds die with their tabs in 9a.
export type PendingEditorOpen = {
  kind: "product" | "visualization" | "dashboard";
  id: string;
};
export const [pendingEditorOpen, setPendingEditorOpen] =
  createSignal<PendingEditorOpen | null>(null);

// Second level of the same pattern: set alongside a pending "deck" request by
// the tour catalogue's slide-tour replays, consumed by the deck editor once
// its slides have loaded: it opens the first slide of this type.
export const [pendingSlideOpen, setPendingSlideOpen] =
  createSignal<SlideType | null>(null);

// Top level of the chain: a tour replay requested from the instance-level
// catalogue before any project shell exists. Set together with navigation to
// `/?p=<projectId>`; the project shell consumes it after hydration and runs
// the tour's own navigate + start.
export const [pendingTourReplay, setPendingTourReplay] = createSignal<
  string | null
>(null);
