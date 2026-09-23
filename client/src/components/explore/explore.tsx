import { t3, TC, type PackageScope, type RunAuthoringContext } from "lib";
import {
  createQuery,
  FrameTop,
  HeadingBar,
  Select,
  StateHolderWrapper,
} from "panther";
import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { exploreTab, setExploreTab } from "~/state/t4_ui";
import { DataTable, type QueriesByFamily } from "./data_table/mod.ts";
import { Visualization } from "./visualization/mod.ts";

const NATIONAL = "__national__";

// The Explore tab's page: one package at one scope, read as a data table or
// through the figure editor. The package starts at the pin (else the newest
// ready package) and the scope national on every mount; neither is stored,
// so a deleted package can never be a stored default. The page tab and the
// family persist in t4_ui. Nothing here is written anywhere.
export function Explore() {
  const [chosenPackageId, setChosenPackageId] = createSignal<string | null>(
    null,
  );
  const packageId = createMemo((): string | undefined => {
    const packages = instanceState.readyPackages;
    const chosen = chosenPackageId();
    if (chosen !== null && packages.some((p) => p.id === chosen)) return chosen;
    const pinned = instanceState.pinnedRunId;
    if (pinned !== null && packages.some((p) => p.id === pinned)) return pinned;
    return packages.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      ?.id;
  });
  const [adminArea2, setAdminArea2] = createSignal<string | null>(null);
  const [gridQueries, setGridQueries] = createSignal<QueriesByFamily>({});
  const areas = createQuery<string[]>(() => serverActions.listAdminArea2s({}));
  const areaOptions = createMemo(() => {
    const state = areas.state();
    const list = state.status === "ready" ? state.data : [];
    return [
      {
        value: NATIONAL,
        label: t3({ en: "National", fr: "National", pt: "Nacional" }),
      },
      ...list.map((a) => ({ value: a, label: a })),
    ];
  });

  return (
    <FrameTop
      panelChildren={
        <Show when={packageId()} keyed>
          {(runId) => (
            <HeadingBar
              compact
              tabs={{
                items: [
                  {
                    id: "data_table" as const,
                    label: t3({
                      en: "Data table",
                      fr: "Tableau de données",
                      pt: "Tabela de dados",
                    }),
                  },
                  {
                    id: "visualization" as const,
                    label: t3({
                      en: "Visualization",
                      fr: "Visualisation",
                      pt: "Visualização",
                    }),
                  },
                ],
                value: exploreTab(),
                onChange: setExploreTab,
              }}
            >
              <div class="ui-gap-sm flex items-center">
                <Select
                  value={runId}
                  options={instanceState.readyPackages.map((pkg) => ({
                    value: pkg.id,
                    label: pkg.label,
                  }))}
                  onChange={setChosenPackageId}
                  size="sm"
                />
                <Select
                  value={adminArea2() ?? NATIONAL}
                  options={areaOptions()}
                  onChange={(v) => setAdminArea2(v === NATIONAL ? null : v)}
                  size="sm"
                />
              </div>
            </HeadingBar>
          )}
        </Show>
      }
    >
      <Show
        when={packageId()}
        keyed
        fallback={
          <div class="ui-pad text-base-content-muted text-sm">
            {t3({
              en: "No results package is ready yet. Generate one from the Results packages page.",
              fr: "Aucun paquet de résultats n'est encore prêt. Générez-en un depuis la page Paquets de résultats.",
              pt: "Ainda não há nenhum pacote de resultados pronto. Gere um na página Pacotes de resultados.",
            })}
          </div>
        }
      >
        {(runId) => (
          <PackageExplorer
            scope={{ runId, adminArea2: adminArea2() }}
            gridQueries={gridQueries()}
            setGridQueries={setGridQueries}
          />
        )}
      </Show>
    </FrameTop>
  );
}

function PackageExplorer(p: {
  scope: PackageScope;
  gridQueries: QueriesByFamily;
  setGridQueries: (queries: QueriesByFamily) => void;
}) {
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.scope.runId),
    t3(TC.loading),
  );
  return (
    <StateHolderWrapper state={context.state()}>
      {(ctx: RunAuthoringContext) => (
        <Switch>
          <Match when={exploreTab() === "data_table"}>
            <DataTable
              ctx={ctx}
              scope={p.scope}
              queries={p.gridQueries}
              setQueries={p.setGridQueries}
            />
          </Match>
          <Match when={exploreTab() === "visualization"}>
            <Visualization ctx={ctx} scope={p.scope} />
          </Match>
        </Switch>
      )}
    </StateHolderWrapper>
  );
}
