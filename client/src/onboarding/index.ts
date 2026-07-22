import { createTourManager, trackPage } from "@njwse/roadtrip/solid";
import type { TourManagerController } from "@njwse/roadtrip";
import type { Accessor } from "solid-js";
import { clerkOnboardingStorage } from "./storage";
import {
  buildDecksEditorTour,
  buildDecksManageTour,
  buildDecksOpenDeckTour,
  buildDecksViewerTour,
} from "./tours";
import { projectState } from "~/state/project/t1_store";

// Call from a component with a reactive owner (the project shell). Each
// page's tour auto-starts on the user's first visit to that page; seen-flags
// live in Clerk unsafeMetadata.onboarding (tour:<id> / tour:<group>), so once
// per user across devices. The page accessor must return a page key only when
// that page is actually visible (tab active AND permission granted) —
// otherwise a tour could fire, find no targets, and be marked seen invisibly.
//
// The decks tour is split into parts with independent seen-flags: the viewer
// part runs for everyone, the editor part is permission-gated, and the
// deck-card parts are deferred until the project has decks. Parts eligible at
// the same moment merge into one seamless run in this array order; a part
// whose condition only holds later runs on the first visit where it does.
export function setupProjectTours(page: Accessor<string>): TourManagerController {
  const hasDecks = () =>
    projectState.projectModules.length > 0 && projectState.slideDecks.length > 0;
  const deckCardOnScreen = () =>
    document.querySelector('[data-tour="decks-deck-card"]') !== null;
  const isEditor = () => projectState.thisUserPermissions.can_configure_slide_decks;
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
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
    ],
  });
  trackPage(tours, page);
  return tours;
}
