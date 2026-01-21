import { getModuleIdForMetric, PresentationObjectSummary, ProjectDetail, t, t2, T } from "lib";
import { CollapsibleSection } from "panther";
import { For, Show, createEffect, createSignal } from "solid-js";
import { setShowModules, showModules } from "~/state/ui";
import { PresentationObjectMiniDisplay } from "./PresentationObjectMiniDisplay";

type Props = {
  projectDetail: ProjectDetail;
  searchText: string;
  onClick: (presentationObject: PresentationObjectSummary) => void;
};

export function PresentationObjectPanelDisplay(p: Props) {
  const isSearching = () => p.searchText.length >= 3;

  return (
    <div class="ui-spy ui-pad">
      <For each={p.projectDetail.projectModules}>
        {(ms) => {
          const nViz = () =>
            p.projectDetail.visualizations.filter((po) => getModuleIdForMetric(po.metricId) === ms.id)
              .length;

          return (
            <CollapsibleSection
              title={
                <div class="font-700 text-lg">
                  {ms.moduleDefinitionLabel}
                  <Show when={!isSearching() && nViz()} keyed>
                    {(count) => (
                      <span class="font-400 ml-2 text-sm">
                        ({count} visualizations)
                      </span>
                    )}
                  </Show>
                </div>
              }
              isOpen={showModules() === ms.id || isSearching()}
              onToggle={(isOpen) => setShowModules(isOpen ? ms.id : undefined)}
            >
              <SubListing
                projectId={p.projectDetail.id}
                onClick={p.onClick}
                searchText={p.searchText}
                presObjSummaries={p.projectDetail.visualizations.filter(
                  (po) => getModuleIdForMetric(po.metricId) === ms.id,
                )}
              />
            </CollapsibleSection>
          );
        }}
      </For>
    </div>
  );
}

type SubListingProps = {
  projectId: string;
  searchText: string;
  onClick: (presentationObject: PresentationObjectSummary) => void;
  presObjSummaries: PresentationObjectSummary[];
};

function SubListing(p: SubListingProps) {
  const [visualizationListing, setVisualizationListing] = createSignal<
    PresentationObjectSummary[]
  >(p.presObjSummaries);

  createEffect(() => {
    updateVisualizationListing(p.searchText);
  });

  async function updateVisualizationListing(searchText: string) {
    await new Promise((res) => setTimeout(res, 0));
    const searchTextLowerCase = searchText.toLowerCase();
    const newVisualisations =
      searchText.length >= 3
        ? p.presObjSummaries.filter((poSummary) =>
            poSummary.label.toLowerCase().includes(searchTextLowerCase),
          )
        : p.presObjSummaries;
    setVisualizationListing(newVisualisations);
  }

  return (
    <div class="ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto">
      <For
        each={visualizationListing()}
        fallback={
          <div class="text-neutral text-sm">
            {p.searchText.length >= 3
              ? t2(T.FRENCH_UI_STRINGS.no_matching_visualizations)
              : t2(T.FRENCH_UI_STRINGS.no_visualizations)}
          </div>
        }
      >
        {(po) => {
          return (
            <div
              class="bg-base-100 hover:ring-primary cursor-pointer ring-offset-[6px] hover:ring-4"
              onClick={() => p.onClick(po)}
            >
              <div class="ui-gap-sm flex items-start justify-between pb-1">
                <div class="font-400 text-base-content text-xs italic">
                  {po.label}
                </div>
              </div>
              <div class="border-base-300 border p-1.5">
                <PresentationObjectMiniDisplay
                  projectId={p.projectId}
                  presentationObjectId={po.id}
                  moduleId={getModuleIdForMetric(po.metricId)}
                  shapeType={"force-aspect-video"}
                  scalePixelResolution={0.2}
                />
              </div>
              <div class="ui-gap-sm flex items-start justify-end pt-1">
                <Show when={po.replicateBy && !po.isFiltered}>
                  <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
                    {t2(T.FRENCH_UI_STRINGS.replicated)}:{" "}
                    {po.replicateBy === "admin_area_2"
                      ? "AA2"
                      : po.replicateBy === "admin_area_3"
                        ? "AA3"
                        : "Indicator"}
                  </div>
                </Show>
                <Show when={!po.replicateBy && po.isFiltered}>
                  <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
                    {t2(T.FRENCH_UI_STRINGS.filtered)}
                  </div>
                </Show>
                <Show when={po.replicateBy && po.isFiltered}>
                  <div class="bg-primary font-400 text-base-100 rounded px-1 py-0.5 text-xs">
                    {t2(T.FRENCH_UI_STRINGS.repl__filt)}
                  </div>
                </Show>
                <Show when={po.createdByAI}>
                  <div class="bg-danger font-400 text-base-100 rounded px-1 py-0.5 text-xs">
                    AI
                  </div>
                </Show>
                <Show when={!po.createdByAI && po.isDefault}>
                  <div class="bg-success font-400 text-base-100 rounded px-1 py-0.5 text-xs">
                    {t2(T.FRENCH_UI_STRINGS.default)}
                  </div>
                </Show>
                <Show when={!po.createdByAI && !po.isDefault}>
                  <div class="font-400 text-base-100 rounded bg-[orange] px-1 py-0.5 text-xs">
                    {t2(T.FRENCH_UI_STRINGS.custom)}
                  </div>
                </Show>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
