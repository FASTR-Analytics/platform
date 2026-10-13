import { resolveVisibleTarget, tourTarget } from "@njwse/roadtrip";
import {
  createTourManager,
  type SolidTourManagerController,
} from "@njwse/roadtrip/solid";
import { createEffect, createSignal } from "solid-js";
import type { CopilotViewId, SlideType } from "lib";
import { clerkOnboardingStorage } from "./storage";
import { reportTourEvent } from "./telemetry";
import {
  buildDeckEditorHistoryTour,
  buildDeckEditorIntroTour,
  buildDeckEditorPresentTour,
  buildDeckEditorSettingsTour,
  buildDeckEditorSlidesTour,
  buildInstanceAssetsTour,
  buildInstanceDataTour,
  buildInstanceResultsPackagesCatalogueTour,
  buildInstanceResultsPackagesTour,
  buildInstanceUsersTour,
  buildInstanceWelcomeTour,
  buildProductsCardsTour,
  buildProductsCreateTour,
  buildProductsIntroTour,
  buildReportEditorFiguresTour,
  buildReportEditorHistoryTour,
  buildReportEditorIntroTour,
  buildSlideContentTour,
  buildSlideCoverTour,
  buildSlideSectionTour,
  tourLabels,
} from "./tours";
import { instanceState } from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { copilotViewController } from "~/components/instance/copilot/mod.ts";
import {
  pendingTourReplay,
  productsExpandedFolders,
  setPendingTourReplay,
} from "~/state/t4_ui";

// ONE manager for the whole app: the instance shell is the only shell, and the
// product editors are overlays rendered on top of it, so a single manager is
// also a single one-run-at-a-time lock (opening a deck mid-tour hands over
// cleanly instead of two tours overlapping).
//
// Each page's tour auto-starts on the user's first visit; seen-flags live in
// Clerk unsafeMetadata.onboarding (tour:<id>), so once per user across devices.
// A `pages` predicate must be true only while that page is actually visible:
// otherwise a tour could fire, find no targets, and be marked seen invisibly.
// Every page keys on the copilot's view controller, on which every tab page,
// full-page view and editor sets its view: a tab page's predicate is
// false under the editor or the full-page view that covers it, since that
// place has set its own view, and false before the page mounts.

const currentView = () => copilotViewController.current();
const onView = (id: CopilotViewId) => () => currentView().id === id;
// The slide tours walk the slide toolbar, which renders only for a user who
// can edit the deck.
const editingSlideOfType = (type: SlideType) => {
  const view = currentView();
  return (
    view.id === "editing_slide" && view.context.getTempSlide().type === type &&
    canEditProduct(view.params.deckId)
  );
};

// Called once from the instance shell, which passes a visibility gate
// (approved) so a tour can never fire behind the sign-in wall.
export function setupTours(opts: {
  instanceVisible: () => boolean;
}): SolidTourManagerController {
  const onPage = (id: CopilotViewId) => () =>
    opts.instanceVisible() && onView(id)();
  const productRowOnScreen = () =>
    document.querySelector('[data-tour="products-item"]') !== null;
  const slideCardOnScreen = () =>
    document.querySelector('[data-tour="deck-slide-card"]') !== null;

  const pages: Record<string, () => boolean> = {
    products: onPage("products"),
    "instance-data": onPage("data"),
    "instance-results-packages": onPage("results_packages"),
    "instance-assets": onPage("assets"),
    "instance-users": onPage("users"),
    // The deck's rail is on screen in both views (a slide is open beside it
    // whenever the deck has one).
    "deck-editor": () =>
      onView("editing_slide_deck")() || onView("editing_slide")(),
    "report-editor": onView("editing_report"),
  };

  const slideTours = [
    { type: "cover", tour: buildSlideCoverTour() },
    { type: "section", tour: buildSlideSectionTour() },
    { type: "content", tour: buildSlideContentTour() },
  ] as const;

  const tours = [
    // Ordered before the products tours: on a brand-new user's first visit
    // all three are eligible on the landing tab and merge into one run, shell
    // first.
    { page: "products", tour: buildInstanceWelcomeTour() },
    { page: "products", tour: buildProductsIntroTour() },
    {
      page: "products",
      when: () => instanceState.currentUserApproved,
      tour: buildProductsCreateTour(),
    },
    // Deferred until the instance holds a product: merges into the intro's run
    // when a product row is on screen, or starts on the first visit where one
    // is.
    {
      page: "products",
      when: productRowOnScreen,
      tour: buildProductsCardsTour(),
    },
    { page: "instance-data", tour: buildInstanceDataTour() },
    {
      page: "instance-results-packages",
      tour: buildInstanceResultsPackagesTour(),
    },
    // Deferred until the instance actually holds a package: merges into the
    // intro's run when a list row is on screen, or starts on its own once the
    // first generation's refetch lands (if the admin is still on the list)
    // or on the next visit. The table must be rendered, not merely in the
    // DOM: an open package page hides the list under the shell wrapper, and
    // the wizard opens the page before the launched run's row lands.
    {
      page: "instance-results-packages",
      when: () =>
        resolveVisibleTarget(tourTarget("instance-results-packages-table")) !==
          null,
      tour: buildInstanceResultsPackagesCatalogueTour(),
    },
    { page: "instance-assets", tour: buildInstanceAssetsTour() },
    { page: "instance-users", tour: buildInstanceUsersTour() },
    // Inside a deck: toolbar, slides, present, history, then open Settings.
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
    // Inside a slide: one tour per slide type, each running the first time the
    // user edits a slide of that type. They share the deck's page, gated on
    // the open slide's type: the rail stays on screen beside an open slide and
    // the manager keeps one page at a time, so a page of their own would
    // never win.
    ...slideTours.map(({ type, tour }) => ({
      page: "deck-editor",
      when: () => editingSlideOfType(type),
      tour,
    })),
    { page: "deck-editor", tour: buildDeckEditorHistoryTour() },
    // Deferred until the Deck menu is on screen: it renders only for a user
    // who can edit the deck.
    {
      page: "deck-editor",
      when: () => document.querySelector('[data-tour="deck-menu"]') !== null,
      tour: buildDeckEditorSettingsTour(),
    },
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

  const [tourEnds, setTourEnds] = createSignal(0);
  const manager = createTourManager({
    storage: clerkOnboardingStorage,
    labels: tourLabels(),
    onEvent: (event) => {
      reportTourEvent(event);
      if (event.type === "finish" || event.type === "abort") {
        setTourEnds((n) => n + 1);
      }
    },
    pages,
    // Extra re-check triggers: the deferred parts, whose `when` gates read the
    // DOM or state the page predicates do not, and each tour's finish or
    // abort, since a re-check made while a run is active starts nothing (the
    // open slide's editor mounts after the deck's own run has launched). Only
    // a tour that ran ends this way, so a run whose steps' `when` gates all
    // fail cannot relaunch itself.
    watch: [
      tourEnds,
      () => instanceState.products.length,
      () => instanceState.readyPackages.length,
      productsExpandedFolders,
      () => {
        const view = currentView();
        return view.id === "editing_slide_deck"
          ? view.context.getSlideIds().length
          : view.id === "editing_slide"
          ? view.context.getTempSlide().type
          : view.id === "editing_report"
          ? Object.keys(view.context.getFigures()).length
          : 0;
      },
    ],
    tours,
  });

  // Replay chain. The catalogue modal calls the entry's navigate(), which
  // switches tab and, for the editor tours, asks the Products page to open a
  // product, and arms `pendingTourReplay` once that has resolved. The editor
  // is not mounted yet at that point, so the start waits here until the
  // tour's own page is active, or for a slide tour until a slide of its type
  // is open, which the deck editor does only after the deck has opened. This
  // effect runs synchronously on every write it tracks, including the
  // Products page clearing `pendingEditorOpen` just before it mounts the
  // editor, so the drop rule reads nothing transient: a replay on a tab page
  // is dropped if the page is not active (the switch was synchronous, so the
  // tab is denied), and a replay on a product is dropped only once T1 is
  // ready and no longer holds that product (a dead id, the Products page's
  // own rule for the open request).
  const replayReadyFor = new Map<string, () => boolean>([
    ...tours.map((t) => [t.tour.id, pages[t.page]] as const),
    ...slideTours.map(
      ({ type, tour }) => [tour.id, () => editingSlideOfType(type)] as const,
    ),
  ]);
  createEffect(() => {
    const replay = pendingTourReplay();
    if (replay === null) return;
    const ready = replayReadyFor.get(replay.tourId);
    if (ready === undefined) {
      setPendingTourReplay(null);
      return;
    }
    if (ready()) {
      setPendingTourReplay(null);
      void manager.start(replay.tourId);
      return;
    }
    if (replay.productId === undefined) {
      setPendingTourReplay(null);
      return;
    }
    const productId = replay.productId;
    if (
      instanceState.isReady &&
      !instanceState.products.some((x) => x.id === productId)
    ) {
      setPendingTourReplay(null);
    }
  });

  return manager;
}
