import { t3 } from "lib";
import type { SlideType } from "lib";
import type { SolidTourManagerController } from "@njwse/roadtrip/solid";
import { type AlertComponentProps } from "panther";
import { For, createSignal, onMount } from "solid-js";
import { setPendingTourReplay } from "~/state/t4_ui";
import {
  SLIDE_TOUR_TYPES,
  findDeckWithSlideOfType,
  getTourAreas,
  getTourCatalogue,
  type InstanceTab,
  type TourCatalogueEntry,
} from "./catalogue";
import { TourCatalogueFrame, TourRow } from "./tour_catalogue_layout";

// Catalogue of every onboarding tour: Play navigates to where the tour runs
// (switching tab and, for the editor tours, asking the Products page to open a
// product) and starts it; unavailable tours are greyed out with a reason.
// There is one manager for the whole app, so every row's seen-state and every
// start goes through it.
export function TourCatalogueModal(
  p: AlertComponentProps<
    {
      manager: SolidTourManagerController;
      openInstanceTab: (tab: InstanceTab) => void;
    },
    undefined
  >,
) {
  // Slide types live only in the slide documents, so the three slide-tour rows
  // need this async search before their availability is trustworthy; the row
  // list waits for it (cache-first, so usually near-instant).
  const [slideTypesPresent, setSlideTypesPresent] = createSignal<
    Partial<Record<SlideType, boolean>> | undefined
  >(undefined);
  onMount(() => {
    void (async () => {
      const present: Partial<Record<SlideType, boolean>> = {};
      for (const type of SLIDE_TOUR_TYPES) {
        present[type] = (await findDeckWithSlideOfType(type)) !== null;
      }
      setSlideTypesPresent(present);
    })();
  });

  const catalogue = () => getTourCatalogue(slideTypesPresent() ?? {});
  const areas = getTourAreas();

  // The Solid manager's hasSeen() reads a signal, so the pill updates on
  // hydration and after a tour finishes without any manual invalidation.
  const seen = (id: string): boolean => p.manager.hasSeen(id);

  function play(entry: TourCatalogueEntry) {
    p.close(undefined);
    // Always through the replay signal: setupTours() starts the tour once the
    // tour's own page is active, which for the editor tours is several frames
    // after navigate() asks for the product.
    setPendingTourReplay(entry.id);
    entry.navigate(p.openInstanceTab);
  }

  return (
    <TourCatalogueFrame
      categories={areas.map((a) => ({
        id: a.area,
        heading: a.heading,
        iconName: a.iconName,
      }))}
      loading={slideTypesPresent() === undefined}
      loadingText={t3({ en: "Loading…", fr: "Chargement…", pt: "A carregar…" })}
      close={() => p.close(undefined)}
      renderCategory={(categoryId) => (
        <For
          each={catalogue().filter((e) => (e.area as string) === categoryId)}
        >
          {(entry) => (
            <TourRow
              label={entry.label}
              description={entry.description}
              seen={seen(entry.id)}
              available={entry.available()}
              reason={entry.unavailableReason()}
              onPlay={() => play(entry)}
            />
          )}
        </For>
      )}
    />
  );
}
