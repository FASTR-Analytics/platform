import { createTourManager } from "@njwse/roadtrip/solid";
import type { TourManagerController } from "@njwse/roadtrip";
import { clerkOnboardingStorage } from "./storage";
import type { InstanceTab } from "./catalogue";
import {
  buildDeckEditorHistoryTour,
  buildDeckEditorIntroTour,
  buildDeckEditorPresentTour,
  buildDeckEditorSettingsTour,
  buildDeckEditorSlidesTour,
  buildDecksEditorTour,
  buildDecksManageTour,
  buildDecksOpenDeckTour,
  buildDecksViewerTour,
  buildSlideContentTour,
  buildSlideCoverTour,
  buildSlideSectionTour,
  buildReportEditorFiguresTour,
  buildReportEditorHistoryTour,
  buildReportEditorIntroTour,
  buildReportsEditorTour,
  buildReportsManageTour,
  buildReportsOpenReportTour,
  buildReportsViewerTour,
  buildResultsPackageIntroTour,
  buildResultsPackageSwitchTour,
  buildSettingsIntroTour,
  buildVizCardsTour,
  buildVizCreateTour,
  buildVizIntroTour,
  buildDashboardsCardsTour,
  buildDashboardsCreateTour,
  buildDashboardsIntroTour,
  buildDashboardEditorIntroTour,
  buildDashboardEditorItemsTour,
  buildVizEditorCreateTour,
  buildVizEditorEditTour,
  buildInstanceAssetsTour,
  buildInstanceDataTour,
  buildInstanceProjectsTour,
  buildInstanceResultsPackagesTour,
  buildInstanceSettingsTour,
  buildInstanceUsersTour,
  buildInstanceWelcomeTour,
} from "./tours";
import { instanceState } from "~/state/instance/t1_store";
import { projectState } from "~/state/project/t1_store";
import { projectAIViewController } from "~/components/project_ai/ai_views";
import type { SlideType } from "lib";
import {
  deckGroupingMode,
  deckSelectedGroup,
  projectTab,
  reportGroupingMode,
  reportSelectedGroup,
  vizGroupingMode,
  vizSelectedGroup,
  dashboardSortMode,
  dashboardEditorOpen,
} from "~/state/t4_ui";

// Call from a component with a reactive owner (the project shell). Each
// page's tour auto-starts on the user's first visit to that page; seen-flags
// live in Clerk unsafeMetadata.onboarding (tour:<id> / tour:<group>), so once
// per user across devices. A `pages` predicate must be true only while that
// page is actually visible (tab active AND permission granted) — otherwise a
// tour could fire, find no targets, and be marked seen invisibly.
//
// The decks tour is split into parts with independent seen-flags: the viewer
// part runs for everyone, the editor part is permission-gated, and the
// deck-card parts are deferred until the project has decks. Parts eligible at
// the same moment merge into one seamless run in this array order; a part
// whose condition only holds later runs on the first visit where it does.
// The editor overlays render on top of the still-mounted project shell, so
// projectTab() stays "decks" inside them — the AI view is what actually tracks
// where the user is. Tab pages must exclude the editing views, or a deck-list
// tour could fire behind the editor.
const currentView = () => projectAIViewController.current();
const isEditingView = () => currentView().id.startsWith("editing_");

// Instance-level tabs (Projects / Data / Assets / Users / Settings). Called
// from the instance shell, which passes its permission-normalized tab
// accessor plus a visibility gate (approved AND not inside a project) so a
// tour can never fire behind a project page.
export function setupInstanceTours(opts: {
  currentTab: () => InstanceTab;
  instanceVisible: () => boolean;
}): TourManagerController {
  const onTab = (tab: string) => () =>
    opts.instanceVisible() && opts.currentTab() === tab;
  return createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      "instance-projects": onTab("projects"),
      "instance-data": onTab("data"),
      "instance-results-packages": onTab("results_packages"),
      "instance-assets": onTab("assets"),
      "instance-users": onTab("users"),
      "instance-settings": onTab("settings"),
    },
    watch: [() => instanceState.projects.length],
    tours: [
      // Ordered before the projects tour: on a brand-new user's first visit
      // both are eligible on the landing tab and merge into one run, shell
      // first.
      { page: "instance-projects", tour: buildInstanceWelcomeTour() },
      { page: "instance-projects", tour: buildInstanceProjectsTour() },
      { page: "instance-data", tour: buildInstanceDataTour() },
      {
        page: "instance-results-packages",
        tour: buildInstanceResultsPackagesTour(),
      },
      { page: "instance-assets", tour: buildInstanceAssetsTour() },
      { page: "instance-users", tour: buildInstanceUsersTour() },
      { page: "instance-settings", tour: buildInstanceSettingsTour() },
    ],
  });
}

const editingVizInMode = (mode: "edit" | "create" | "ephemeral") => {
  const view = currentView();
  return view.id === "editing_visualization" && view.params.mode === mode;
};

const editingSlideOfType = (type: SlideType) => {
  const view = currentView();
  return (
    view.id === "editing_slide" && view.context.getTempSlide().type === type
  );
};

export function setupDeckTours(): TourManagerController {
  const hasDecks = () =>
    projectState.projectModules.length > 0 &&
    projectState.slideDecks.length > 0;
  const deckCardOnScreen = () =>
    document.querySelector('[data-tour="decks-deck-card"]') !== null;
  const isEditor = () =>
    projectState.thisUserPermissions.can_configure_slide_decks;
  const slideCardOnScreen = () =>
    document.querySelector('[data-tour="deck-slide-card"]') !== null;
  // The deck list, the deck editor and the per-slide-type tours share ONE
  // manager so they also share its one-run-at-a-time lock — clicking a deck
  // mid-tour hands over cleanly instead of two tours overlapping.
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      decks: () =>
        projectTab() === "decks" &&
        projectState.thisUserPermissions.can_view_slide_decks &&
        !isEditingView(),
      "deck-editor": () => currentView().id === "editing_slide_deck",
      "slide-cover": () => editingSlideOfType("cover"),
      "slide-section": () => editingSlideOfType("section"),
      "slide-content": () => editingSlideOfType("content"),
    },
    // extra re-check triggers so the deferred card tours can start mid-visit
    // when decks/slides appear or the folder view changes
    watch: [
      () => projectState.slideDecks.length,
      deckSelectedGroup,
      deckGroupingMode,
      () => {
        const view = currentView();
        return view.id === "editing_slide_deck"
          ? view.context.getSlideIds().length
          : 0;
      },
    ],
    tours: [
      {
        page: "decks",
        tour: buildDecksViewerTour(),
      },
      {
        page: "decks",
        when: () => hasDecks() && deckCardOnScreen(),
        tour: buildDecksOpenDeckTour(),
      },
      {
        page: "decks",
        when: isEditor,
        tour: buildDecksEditorTour(),
      },
      {
        page: "decks",
        when: () =>
          isEditor() &&
          !projectState.isLocked &&
          hasDecks() &&
          deckCardOnScreen(),
        tour: buildDecksManageTour(),
      },
      // Inside a deck: toolbar → slides → open Settings. Array order is merge
      // order, so the Settings part (which ends inside the settings overlay)
      // always comes last.
      {
        page: "deck-editor",
        tour: buildDeckEditorIntroTour(),
      },
      {
        page: "deck-editor",
        when: slideCardOnScreen,
        tour: buildDeckEditorSlidesTour(),
      },
      {
        page: "deck-editor",
        when: () => document.querySelector("#deck-present-button") !== null,
        tour: buildDeckEditorPresentTour(),
      },
      // Both of these end inside a full-region overlay, so each closes itself
      // before the next begins: history hands back via its back button, and
      // settings comes last.
      {
        page: "deck-editor",
        tour: buildDeckEditorHistoryTour(),
      },
      {
        page: "deck-editor",
        tour: buildDeckEditorSettingsTour(),
      },
      // Inside a slide: one tour per slide type, each running the first time
      // the user edits a slide of that type.
      {
        page: "slide-cover",
        tour: buildSlideCoverTour(),
      },
      {
        page: "slide-section",
        tour: buildSlideSectionTour(),
      },
      {
        page: "slide-content",
        tour: buildSlideContentTour(),
      },
    ],
  });
  return tours;
}

// Same layering as the decks tours: a viewer part for everyone, a
// permission-gated editor part, and card parts deferred until a report is on
// screen.
export function setupReportTours(): TourManagerController {
  const hasReports = () => projectState.reports.length > 0;
  const reportCardOnScreen = () =>
    document.querySelector('[data-tour="reports-report-card"]') !== null;
  const isEditor = () => projectState.thisUserPermissions.can_configure_reports;
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      reports: () =>
        projectTab() === "reports" &&
        projectState.thisUserPermissions.can_view_reports &&
        !isEditingView(),
      "report-editor": () => currentView().id === "editing_report",
    },
    watch: [
      () => projectState.reports.length,
      reportSelectedGroup,
      reportGroupingMode,
      () => {
        const view = currentView();
        return view.id === "editing_report"
          ? Object.keys(view.context.getFigures()).length
          : 0;
      },
    ],
    tours: [
      {
        page: "reports",
        tour: buildReportsViewerTour(),
      },
      {
        page: "reports",
        when: () => hasReports() && reportCardOnScreen(),
        tour: buildReportsOpenReportTour(),
      },
      {
        page: "reports",
        when: isEditor,
        tour: buildReportsEditorTour(),
      },
      {
        page: "reports",
        when: () =>
          isEditor() &&
          !projectState.isLocked &&
          hasReports() &&
          reportCardOnScreen(),
        tour: buildReportsManageTour(),
      },
      // Inside a report: the walkthrough, then the figure step once one is
      // actually in the document, then history (which closes itself).
      {
        page: "report-editor",
        tour: buildReportEditorIntroTour(),
      },
      {
        page: "report-editor",
        when: () => document.querySelector("[data-embed-id]") !== null,
        tour: buildReportEditorFiguresTour(),
      },
      {
        page: "report-editor",
        tour: buildReportEditorHistoryTour(),
      },
    ],
  });
  return tours;
}

export function setupVisualizationTours(): TourManagerController {
  const cardOnScreen = () =>
    document.querySelector('[data-tour="viz-card"]') !== null;
  const canCreate = () =>
    !projectState.isLocked && projectState.projectModules.length > 0;
  return createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      visualizations: () =>
        projectTab() === "visualizations" &&
        projectState.thisUserPermissions.can_view_visualizations &&
        !isEditingView(),
      "viz-editor-create": () => editingVizInMode("create"),
      "viz-editor-edit": () => editingVizInMode("edit"),
    },
    watch: [
      () => projectState.visualizations.length,
      () => projectState.projectModules.length,
      vizSelectedGroup,
      vizGroupingMode,
    ],
    tours: [
      {
        page: "visualizations",
        tour: buildVizIntroTour(),
      },
      {
        page: "visualizations",
        when: cardOnScreen,
        tour: buildVizCardsTour(),
      },
      {
        page: "visualizations",
        when: canCreate,
        tour: buildVizCreateTour(),
      },
      {
        page: "viz-editor-create",
        tour: buildVizEditorCreateTour(),
      },
      {
        page: "viz-editor-edit",
        tour: buildVizEditorEditTour(),
      },
    ],
  });
}

// The results package tab: the intro runs for anyone who can see the tab, the
// switch part only for a member who may actually repoint the project AND has
// somewhere to repoint it — the picker renders nothing when the instance holds
// no other package, so without that check the tour would target an empty box.
export function setupResultsPackageTours(): TourManagerController {
  const canAttach = () =>
    instanceState.currentUserIsGlobalAdmin ||
    projectState.thisUserPermissions.can_configure_visualizations;
  const pickerOnScreen = () =>
    document.querySelector('[data-tour="results-package-picker"]') !== null;
  return createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      "results-package": () =>
        projectTab() === "results_package" &&
        projectState.thisUserPermissions.can_view_data &&
        !isEditingView(),
    },
    // The attached card and its contents arrive from a fetch, not from
    // projectState, so re-evaluate when a repoint lands.
    watch: [() => projectState.attachedRunId],
    tours: [
      {
        page: "results-package",
        tour: buildResultsPackageIntroTour(),
      },
      {
        page: "results-package",
        when: () => canAttach() && !projectState.isLocked && pickerOnScreen(),
        tour: buildResultsPackageSwitchTour(),
      },
    ],
  });
}

export function setupSettingsTours(): TourManagerController {
  return createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      settings: () =>
        projectTab() === "settings" &&
        projectState.thisUserPermissions.can_configure_settings &&
        !isEditingView(),
    },
    tours: [
      {
        page: "settings",
        tour: buildSettingsIntroTour(),
      },
    ],
  });
}

// The dashboards tab: intro for everyone, then the card and create parts once
// each is actually possible. Creating uses the slide-deck configure permission.
export function setupDashboardTours(): TourManagerController {
  return createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      dashboards: () =>
        projectTab() === "dashboards" &&
        projectState.thisUserPermissions.can_view_slide_decks &&
        !isEditingView() &&
        !dashboardEditorOpen(),
      "dashboard-editor": () => dashboardEditorOpen() && !isEditingView(),
    },
    watch: [
      () => projectState.dashboards.length,
      dashboardSortMode,
      dashboardEditorOpen,
    ],
    tours: [
      {
        page: "dashboards",
        tour: buildDashboardsIntroTour(),
      },
      {
        page: "dashboards",
        when: () =>
          document.querySelector('[data-tour="dashboards-card"]') !== null,
        tour: buildDashboardsCardsTour(),
      },
      {
        page: "dashboards",
        when: () =>
          projectState.thisUserPermissions.can_configure_slide_decks &&
          !projectState.isLocked,
        tour: buildDashboardsCreateTour(),
      },
      // Inside a dashboard. The intro ends inside the settings overlay, so the
      // items part is ordered before it.
      {
        page: "dashboard-editor",
        when: () =>
          document.querySelector('[data-tour="dashboard-item-card"]') !== null,
        tour: buildDashboardEditorItemsTour(),
      },
      {
        page: "dashboard-editor",
        tour: buildDashboardEditorIntroTour(),
      },
    ],
  });
}
