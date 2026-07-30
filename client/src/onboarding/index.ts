import { createTourManager } from "@njwse/roadtrip/solid";
import type { TourManagerController } from "@njwse/roadtrip";
import { clerkOnboardingStorage } from "./storage";
import {
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
  buildModulesEnableTour,
  buildModulesIntroTour,
  buildModulesManageTour,
  buildReportsEditorTour,
  buildReportsManageTour,
  buildReportsOpenReportTour,
  buildReportsViewerTour,
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

const editingSlideOfType = (type: SlideType) => {
  const view = currentView();
  return view.id === "editing_slide" && view.context.getTempSlide().type === type;
};

export function setupDeckTours(): TourManagerController {
  const hasDecks = () =>
    projectState.projectModules.length > 0 && projectState.slideDecks.length > 0;
  const deckCardOnScreen = () =>
    document.querySelector('[data-tour="decks-deck-card"]') !== null;
  const isEditor = () => projectState.thisUserPermissions.can_configure_slide_decks;
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
          isEditor() && !projectState.isLocked && hasDecks() && deckCardOnScreen(),
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
    },
    watch: [
      () => projectState.reports.length,
      reportSelectedGroup,
      reportGroupingMode,
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
    ],
  });
  return tours;
}

// The modules tab has no folders or search — the parts split by what's on
// screen instead: the intro always runs, while the manage and enable parts
// wait for an enabled / available module card to exist.
export function setupModuleTours(): TourManagerController {
  const canConfigure = () =>
    instanceState.currentUserIsGlobalAdmin ||
    projectState.thisUserPermissions.can_configure_modules;
  const installedCardOnScreen = () =>
    document.querySelector('[data-tour="modules-installed-card"]') !== null;
  const availableCardOnScreen = () =>
    document.querySelector('[data-tour="modules-uninstalled-card"]') !== null;
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
    pages: {
      modules: () => {
        const perms = projectState.thisUserPermissions;
        return (
          projectTab() === "modules" &&
          !isEditingView() &&
          (perms.can_configure_modules ||
            perms.can_run_modules ||
            perms.can_view_script_code)
        );
      },
    },
    watch: [() => projectState.projectModules.length],
    tours: [
      {
        page: "modules",
        tour: buildModulesIntroTour(),
      },
      {
        page: "modules",
        when: () => canConfigure() && installedCardOnScreen(),
        tour: buildModulesManageTour(),
      },
      {
        page: "modules",
        when: () => canConfigure() && availableCardOnScreen(),
        tour: buildModulesEnableTour(),
      },
    ],
  });
  return tours;
}
