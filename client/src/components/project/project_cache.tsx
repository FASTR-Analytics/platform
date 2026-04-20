import { t3 } from "lib";
import { HeadingBar, StateHolderWrapper, timQuery } from "panther";
import { For } from "solid-js";
import { serverActions } from "~/server_actions";
import { useProjectDetail } from "~/components/project_runner/mod";

export function ProjectCache() {
  const projectDetail = useProjectDetail();

  const cacheQuery = timQuery(
    () => serverActions.getCacheStatus({ projectId: projectDetail.id }),
    t3({ en: "Loading cache status...", fr: "Chargement du statut du cache..." }),
  );

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <HeadingBar heading={t3({ en: "Cache Status", fr: "Statut du cache" })} />
      <div class="flex-1 overflow-y-auto">
        <StateHolderWrapper state={cacheQuery.state()}>
          {(data) => (
            <div class="ui-pad flex flex-col ui-gap">
              <div class="flex items-center ui-gap-sm text-sm">
                <span class="font-500">{t3({ en: "Valkey", fr: "Valkey" })}:</span>
                <span class={data.valkeyConnected ? "text-success" : "text-error"}>
                  {data.valkeyConnected
                    ? t3({ en: "Connected", fr: "Connecté" })
                    : t3({ en: "Not connected", fr: "Non connecté" })}
                </span>
              </div>

              <div>
                <div class="font-500 mb-2 text-sm">
                  {t3({ en: "Visualizations", fr: "Visualisations" })} ({data.visualizations.length})
                </div>
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="border-b text-left text-xs text-base-content/60">
                      <th class="pb-1 pr-4 font-500">{t3({ en: "Label", fr: "Libellé" })}</th>
                      <th class="pb-1 pr-4 font-500">{t3({ en: "PO Detail", fr: "Détail PO" })}</th>
                      <th class="pb-1 font-500">{t3({ en: "Metric Info", fr: "Info indicateur" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data.visualizations}>
                      {(viz) => (
                        <tr class="border-b border-base-content/10">
                          <td class="py-1 pr-4">{viz.label}</td>
                          <td class="py-1 pr-4">
                            <CacheIndicator cached={viz.poDetailCached} />
                          </td>
                          <td class="py-1">
                            <CacheIndicator cached={viz.metricInfoCached} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

              <div>
                <div class="font-500 mb-2 text-sm">
                  {t3({ en: "Slide decks", fr: "Présentations" })} ({data.slideDecks.length})
                </div>
                <table class="w-full text-sm border-collapse">
                  <thead>
                    <tr class="border-b text-left text-xs text-base-content/60">
                      <th class="pb-1 pr-4 font-500">{t3({ en: "Label", fr: "Libellé" })}</th>
                      <th class="pb-1 font-500">{t3({ en: "Valkey cache", fr: "Cache Valkey" })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data.slideDecks}>
                      {(deck) => (
                        <tr class="border-b border-base-content/10">
                          <td class="py-1 pr-4">{deck.label}</td>
                          <td class="py-1 text-base-content/40 text-xs">
                            {t3({ en: "No cache", fr: "Pas de cache" })}
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </StateHolderWrapper>
      </div>
    </div>
  );
}

function CacheIndicator(p: { cached: boolean }) {
  return (
    <span class={p.cached ? "text-success" : "text-base-content/40"}>
      {p.cached ? "✓" : "—"}
    </span>
  );
}
