import {
  createTourManager,
  type SolidTourManagerController,
} from "@njwse/roadtrip/solid";
import { createEffect } from "solid-js";
import { clerkOnboardingStorage } from "./storage";
import { reportTourEvent } from "./telemetry";
import type { InstanceTab } from "./catalogue";
import {
  buildDeckEditorHistoryTour,
  buildDeckEditorIntroTour,
  buildDeckEditorPresentTour,
  buildDeckEditorSettingsTour,
  buildDeckEditorSlidesTour,
  buildExploreIntroTour,
  buildProductsCardsTour,
  buildProductsCreateTour,
  buildProductsIntroTour,
  buildSlideContentTour,
  buildSlideCoverTour,
  buildSlideSectionTour,
  buildReportEditorFiguresTour,
  buildReportEditorHistoryTour,
  buildReportEditorIntroTour,
  buildInstanceAssetsTour,
  buildInstanceDataTour,
  buildInstanceResultsPackagesCatalogueTour,
  buildInstanceResultsPackagesTour,
  buildInstanceUsersTour,
  buildInstanceWelcomeTour,
  tourLabels,
} from "./tours";
import { canEditProducts, instanceState } from "~/state/instance/t1_store";
import { copilotViewController } from "~/components/copilot/ai_views";
import type { SlideType } from "lib";
import {
  pendingEditorOpen,
  pendingTourReplay,
  productsOpenFolder,
  productsTypeFilter,
  productsViewMode,
  setPendingTourReplay,
} from "~/state/t4_ui";

// ONE manager for the whole app: the instance shell is the only shell, and the
// product editors are overlays rendered on top of it, so a single manager also
// gives a single one-run-at-a-time lock — opening a deck mid-tour hands over
// cleanly instead of two tours overlapping.
//
// Each page's tour auto-starts on the user's first visit; seen-flags live in
// Clerk unsafeMetadata.onboarding (tour:<id>), so once per user across devices.
// A `pages` predicate must be true only while that page is actually visible
// (tab active AND permission granted) — otherwise a tour could fire, find no
// targets, and be marked seen invisibly. The editors keep the shell's tab on
// "products", so the two page-level predicates exclude the editing views; the
// copilot's view controller is what actually tracks where the user is.

const currentView = () => copilotViewController.current();
const isEditingView = () => currentView().id.startsWith("editing_");
const editingSlideOfType = (type: SlideType) => {
  const view = currentView();
  return (
    view.id === "editing_slide" && view.context.getTempSlide().type === type
  );
};

// Called once from the instance shell, which passes its permission-normalized
// tab accessor plus a visibility gate (approved) so a tour can never fire
// behind the sign-in wall.
export function setupTours(opts: {
  currentTab: () => InstanceTab;
  instanceVisible: () => boolean;
}): SolidTourManagerController {
  const onTab = (tab: InstanceTab) => () =>
    opts.instanceVisible() && opts.currentTab() === tab;
  const onProductsPage = () => onTab("products")() && !isEditingView();
  const productCardOnScreen = () =>
    document.querySelector('[data-tour="products-item"]') !== null;
  const slideCardOnScreen = () =>
    document.querySelector('[data-tour="deck-slide-card"]') !== null;

  const pages: Record<string, () => boolean> = {
    products: onProductsPage,
    explore: () => onTab("explore")() && !isEditingView(),
    "instance-data": onTab("data"),
    "instance-results-packages": onTab("results_packages"),
    "instance-assets": onTab("assets"),
    "instance-users": onTab("users"),
    "deck-editor": () => currentView().id === "editing_slide_deck",
    "slide-cover": () => editingSlideOfType("cover"),
    "slide-section": () => editingSlideOfType("section"),
    "slide-content": () => editingSlideOfType("content"),
    "report-editor": () => currentView().id === "editing_report",
  };

  const tours = [
    // Ordered before the products tours: on a brand-new user's first visit
    // all three are eligible on the landing tab and merge into one run, shell
    // first.
    { page: "products", tour: buildInstanceWelcomeTour() },
    { page: "products", tour: buildProductsIntroTour() },
    { page: "products", when: canEditProducts, tour: buildProductsCreateTour() },
    // Deferred until the instance holds a product: merges into the intro's run
    // when a card is on screen, or starts on the first visit where one is.
    {
      page: "products",
      when: productCardOnScreen,
      tour: buildProductsCardsTour(),
    },
    { page: "explore", tour: buildExploreIntroTour() },
    { page: "instance-data", tour: buildInstanceDataTour() },
    {
      page: "instance-results-packages",
      tour: buildInstanceResultsPackagesTour(),
    },
    // Deferred until the instance actually holds a package: merges into the
    // intro's run when a card is on screen, or starts on its own once the
    // first generation's refetch lands (if the admin is still on the tab)
    // or on the next visit.
    {
      page: "instance-results-packages",
      when: () =>
        document.querySelector('[data-tour="instance-results-packages-card"]') !==
        null,
      tour: buildInstanceResultsPackagesCatalogueTour(),
    },
    { page: "instance-assets", tour: buildInstanceAssetsTour() },
    { page: "instance-users", tour: buildInstanceUsersTour() },
    // Inside a deck: toolbar → slides → present → history → open Settings.
    // Array order is merge order, so the two parts that end inside a
    // full-region overlay come last (history hands back via its back button,
    // and settings is the very end of the run).
    { page: "deck-editor", tour: buildDeckEditorIntroTour() },
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
    { page: "deck-editor", tour: buildDeckEditorHistoryTour() },
    { page: "deck-editor", tour: buildDeckEditorSettingsTour() },
    // Inside a slide: one tour per slide type, each running the first time the
    // user edits a slide of that type.
    { page: "slide-cover", tour: buildSlideCoverTour() },
    { page: "slide-section", tour: buildSlideSectionTour() },
    { page: "slide-content", tour: buildSlideContentTour() },
    // Inside a report: the walkthrough, then the figure step once one is
    // actually in the document, then history (which closes itself).
    { page: "report-editor", tour: buildReportEditorIntroTour() },
    {
      page: "report-editor",
      when: () => document.querySelector("[data-embed-id]") !== null,
      tour: buildReportEditorFiguresTour(),
    },
    { page: "report-editor", tour: buildReportEditorHistoryTour() },
  ];

  const manager = createTourManager({
    storage: clerkOnboardingStorage,
    labels: tourLabels(),
    onEvent: reportTourEvent,
    pages,
    // Extra re-check triggers for the deferred parts, whose `when` gates read
    // the DOM rather than reactive state.
    watch: [
      () => instanceState.products.length,
      () => instanceState.readyPackages.length,
      productsOpenFolder,
      productsTypeFilter,
      productsViewMode,
      () => {
        const view = currentView();
        return view.id === "editing_slide_deck"
          ? view.context.getSlideIds().length
          : view.id === "editing_report"
            ? Object.keys(view.context.getFigures()).length
            : 0;
      },
    ],
    tours,
  });

  // Replay chain. The catalogue modal sets `pendingTourReplay` and calls the
  // entry's navigate(), which switches tab and — for the editor tours — asks
  // the Products page to open a product. The editor is not mounted yet at that
  // point, so the start waits here until the tour's own page is active.
  // A replay whose product turns out to be a dead id is dropped: the Products
  // page clears `pendingEditorOpen` once T1 is ready and the id is still
  // absent, which leaves no page to wait for.
  const pageForTour = new Map(tours.map((t) => [t.tour.id, t.page]));
  createEffect(() => {
    const tourId = pendingTourReplay();
    if (tourId === null) return;
    const page = pageForTour.get(tourId);
    if (page === undefined) {
      setPendingTourReplay(null);
      return;
    }
    if (pages[page]()) {
      setPendingTourReplay(null);
      void manager.start(tourId);
      return;
    }
    if (pendingEditorOpen() === null) setPendingTourReplay(null);
  });

  return manager;
}
