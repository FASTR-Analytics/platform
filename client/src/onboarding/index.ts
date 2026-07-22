import { createTourManager, trackPage } from "@njwse/roadtrip/solid";
import type { TourManagerController } from "@njwse/roadtrip";
import type { Accessor } from "solid-js";
import { clerkOnboardingStorage } from "./storage";
import { buildDecksEditorTour, buildDecksViewerTour } from "./tours";
import { projectState } from "~/state/project/t1_store";

// Call from a component with a reactive owner (the project shell). Each
// page's tour auto-starts on the user's first visit to that page; seen-flags
// live in Clerk unsafeMetadata.onboarding (tour:<id> / tour:<group>), so once
// per user across devices. The page accessor must return a page key only when
// that page is actually visible (tab active AND permission granted) —
// otherwise a tour could fire, find no targets, and be marked seen invisibly.
//
// The decks tour is layered: the viewer part runs for everyone; the editor
// part is permission-gated with its own seen-flag. An editor's first visit
// merges both into one run (viewer part first); a viewer promoted to editor
// later gets just the editor part on their next decks visit.
export function setupProjectTours(page: Accessor<string>): TourManagerController {
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
    tours: [
      {
        page: "decks",
        tour: buildDecksViewerTour(),
      },
      {
        page: "decks",
        when: () => projectState.thisUserPermissions.can_configure_slide_decks,
        tour: buildDecksEditorTour(),
      },
    ],
  });
  trackPage(tours, page);
  return tours;
}
