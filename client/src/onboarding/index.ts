import { createTourManager, trackPage } from "@njwse/roadtrip/solid";
import type { TourManagerController } from "@njwse/roadtrip";
import type { Accessor } from "solid-js";
import { clerkOnboardingStorage } from "./storage";
import { buildDecksTour } from "./tours";

// Call from a component with a reactive owner (the project shell). Each
// page's tour auto-starts on the user's first visit to that page; seen-flags
// live in Clerk unsafeMetadata.onboarding (tour:<id>), so once per user
// across devices. The page accessor must return a page key only when that
// page is actually visible (tab active AND permission granted) — otherwise
// a tour could fire, find no targets, and be marked seen invisibly.
export function setupProjectTours(page: Accessor<string>): TourManagerController {
  const tours = createTourManager({
    storage: clerkOnboardingStorage,
    tours: [{ page: "decks", tour: buildDecksTour() }],
  });
  trackPage(tours, page);
  return tours;
}
