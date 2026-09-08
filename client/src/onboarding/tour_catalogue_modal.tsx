import { t3 } from "lib";
import type { SolidTourManagerController } from "@njwse/roadtrip/solid";
import { type AlertComponentProps } from "panther";
import { projectState } from "~/state/project/t1_store";
import { projectTab } from "~/state/t4_ui";
import {
  getTourCatalogue,
  type TourCatalogueEntry,
  type TourProjectFacts,
} from "./catalogue";
import {
  TourCatalogueFrame,
  TourRow,
  getAreaItems,
} from "./tour_catalogue_layout";
import { For } from "solid-js";

// Catalogue of every onboarding tour: Play navigates to where the tour runs
// (switching tab and opening a document/slide where needed) and starts it;
// unavailable tours are greyed out with a reason. The per-area managers come
// from the project shell as props, so they share its lifecycle and each
// action is routed to its owner via hasTour().
export function TourCatalogueModal(
  p: AlertComponentProps<{ managers: SolidTourManagerController[] }, undefined>,
) {
  const managerFor = (id: string) => p.managers.find((m) => m.hasTour(id));

  const facts = (): TourProjectFacts => ({
    thisUserPermissions: projectState.thisUserPermissions,
    isLocked: projectState.isLocked,
    attachedRunId: projectState.attachedRunId,
    projectModules: projectState.projectModules,
    metrics: projectState.metrics,
    visualizations: projectState.visualizations,
    dashboards: projectState.dashboards,
  });

  // The Solid manager's hasSeen() reads a signal, so the pill updates on
  // hydration and after a tour finishes without any manual invalidation.
  const seen = (id: string): boolean => managerFor(id)?.hasSeen(id) ?? false;

  function play(entry: TourCatalogueEntry) {
    const manager = managerFor(entry.id);
    p.close(undefined);
    entry.navigate();
    // start() runs regardless of seen state, so no reset is needed
    void manager?.start(entry.id);
  }

  const catalogue = getTourCatalogue();
  const areas = getAreaItems();

  // Preselect the category of the tab the user is on (the tab ids and tour
  // areas share names for every tab that has tours).
  const currentTab = projectTab();
  const initialCategory = areas.some((a) => (a.area as string) === currentTab)
    ? currentTab
    : undefined;

  return (
    <TourCatalogueFrame
      categories={areas.map((a) => ({
        id: a.area,
        heading: a.heading,
        iconName: a.iconName,
      }))}
      initialCategory={initialCategory}
      loading={false}
      loadingText={t3({ en: "Loading…", fr: "Chargement…", pt: "A carregar…" })}
      close={() => p.close(undefined)}
      renderCategory={(categoryId) => (
        <For each={catalogue.filter((e) => (e.area as string) === categoryId)}>
          {(entry) => (
            <TourRow
              label={entry.label}
              description={entry.description}
              seen={seen(entry.id)}
              available={entry.available(facts())}
              reason={entry.unavailableReason(facts()).text}
              onPlay={() => play(entry)}
            />
          )}
        </For>
      )}
    />
  );
}
