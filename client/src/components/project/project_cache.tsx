import { t3 } from "lib";
import { HeadingBar, StateHolderWrapper, timQuery } from "panther";
import { createResource, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { useProjectDetail } from "~/components/project_runner/mod";
import { getClientCacheBuckets } from "~/state/clear_caches";

export function ProjectCache() {
  const projectDetail = useProjectDetail();

  const cacheQuery = timQuery(
    () => serverActions.getCacheStatus({ projectId: projectDetail.id }),
    t3({ en: "Loading cache status...", fr: "Chargement du statut du cache..." }),
  );

  const [clientBuckets, { refetch: refetchClient }] = createResource(getClientCacheBuckets);

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <HeadingBar heading={t3({ en: "Cache Status", fr: "Statut du cache" })} />
      <div class="flex-1 overflow-y-auto">
        <StateHolderWrapper state={cacheQuery.state()}>
          {(data) => (
            <div class="ui-pad flex flex-col ui-gap">
              <div class="font-500 text-sm">
                {t3({ en: "Server-side (Valkey)", fr: "Côté serveur (Valkey)" })}
              </div>
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
                      <th class="pb-1 pr-4 font-500">{t3({ en: "Metric Info", fr: "Info indicateur" })}</th>
                      <th class="pb-1 pr-4 font-500">{t3({ en: "PO Items", fr: "Éléments PO" })}</th>
                      <th class="pb-1 font-500">{t3({ en: "Replicant Opts", fr: "Options réplicant" })}</th>
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
                          <td class="py-1 pr-4">
                            <CacheIndicator cached={viz.metricInfoCached} />
                          </td>
                          <td class="py-1 pr-4">
                            <CacheCount count={viz.poItemsCount} />
                          </td>
                          <td class="py-1">
                            <CacheCount count={viz.replicantOptionsCount} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

              <div class="border-t pt-4 mt-2 flex items-center justify-between">
                <div class="font-500 text-sm">
                  {t3({ en: "Client-side (IndexedDB)", fr: "Côté client (IndexedDB)" })}
                </div>
                <button
                  type="button"
                  class="text-xs text-base-content/60 hover:text-base-content"
                  onClick={() => refetchClient()}
                >
                  {t3({ en: "Refresh", fr: "Actualiser" })}
                </button>
              </div>
              <Show
                when={clientBuckets()}
                fallback={
                  <div class="text-sm text-base-content/60">
                    {t3({ en: "Scanning…", fr: "Analyse…" })}
                  </div>
                }
              >
                {(buckets) => (
                  <div>
                    <div class="font-500 mb-2 text-sm">
                      {t3({ en: "IndexedDB entries", fr: "Entrées IndexedDB" })} ({buckets().total})
                    </div>
                    <table class="w-full text-sm border-collapse">
                      <thead>
                        <tr class="border-b text-left text-xs text-base-content/60">
                          <th class="pb-1 pr-4 font-500">{t3({ en: "Cache", fr: "Cache" })}</th>
                          <th class="pb-1 font-500">{t3({ en: "Entries", fr: "Entrées" })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={buckets().buckets}>
                          {(b) => (
                            <tr class="border-b border-base-content/10">
                              <td class="py-1 pr-4">{b.name}</td>
                              <td class="py-1">
                                <CacheCount count={b.count} />
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                )}
              </Show>
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

function CacheCount(p: { count: number }) {
  return (
    <span class={p.count > 0 ? "text-success" : "text-base-content/40"}>
      {p.count > 0 ? p.count : "—"}
    </span>
  );
}
