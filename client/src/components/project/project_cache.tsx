import { t3 } from "lib";
import { HeadingBar, StateHolderWrapper, timQuery } from "panther";
import { createResource, For } from "solid-js";
import { serverActions } from "~/server_actions";
import { projectState } from "~/state/project/t1_store";
import { getClientVizCacheStatuses, type ClientVizCacheStatus } from "~/state/clear_caches";

export function ProjectCache() {
  const cacheQuery = timQuery(
    () => serverActions.getCacheStatus({ projectId: projectState.id }),
    t3({ en: "Loading cache status...", fr: "Chargement du statut du cache..." }),
  );

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <HeadingBar heading={t3({ en: "Cache Status", fr: "Statut du cache" })} />
      <div class="flex-1 overflow-y-auto">
        <StateHolderWrapper state={cacheQuery.state()}>
          {(data) => {
            const [clientStatuses, { refetch: refetchClient }] = createResource(() =>
              getClientVizCacheStatuses(projectState.id, data.visualizations),
            );

            const clientMap = (): Map<string, ClientVizCacheStatus> => {
              const map = new Map<string, ClientVizCacheStatus>();
              for (const s of clientStatuses() ?? []) map.set(s.id, s);
              return map;
            };

            const serverRows = (): VizRow[] =>
              data.visualizations.map((viz) => ({
                id: viz.id,
                label: viz.label,
                poDetailCached: viz.poDetailCached,
                metricInfoCached: viz.metricInfoCached,
                poItemsCount: viz.poItemsCount,
                replicantOptionsCount: viz.replicantOptionsCount,
              }));

            const clientRows = (): VizRow[] =>
              data.visualizations.map((viz) => {
                const s = clientMap().get(viz.id);
                return {
                  id: viz.id,
                  label: viz.label,
                  poDetailCached: s?.poDetailCached ?? false,
                  metricInfoCached: s?.metricInfoCached ?? false,
                  poItemsCount: s?.poItemsCount ?? 0,
                  replicantOptionsCount: s?.replicantOptionsCount ?? 0,
                };
              });

            return (
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

                <VisualizationsTable rows={serverRows()} />

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

                <VisualizationsTable rows={clientRows()} />
              </div>
            );
          }}
        </StateHolderWrapper>
      </div>
    </div>
  );
}

type VizRow = {
  id: string;
  label: string;
  poDetailCached: boolean;
  metricInfoCached: boolean;
  poItemsCount: number;
  replicantOptionsCount: number;
};

function VisualizationsTable(p: { rows: VizRow[] }) {
  return (
    <div>
      <div class="font-500 mb-2 text-sm">
        {t3({ en: "Visualizations", fr: "Visualisations" })} ({p.rows.length})
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
          <For each={p.rows}>
            {(row) => (
              <tr class="border-b border-base-content/10">
                <td class="py-1 pr-4">{row.label}</td>
                <td class="py-1 pr-4"><CacheIndicator cached={row.poDetailCached} /></td>
                <td class="py-1 pr-4"><CacheIndicator cached={row.metricInfoCached} /></td>
                <td class="py-1 pr-4"><CacheCount count={row.poItemsCount} /></td>
                <td class="py-1"><CacheCount count={row.replicantOptionsCount} /></td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
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
