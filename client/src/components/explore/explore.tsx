import {
  getModuleFamilyLabel,
  MODULE_FAMILY_ORDER,
  t3,
  TC,
  type DatasetType,
  type GridQuery,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import {
  createQuery,
  FrameLeft,
  FrameTop,
  HeadingBar,
  Select,
  StateHolderWrapper,
} from "panther";
import { createMemo, createSignal, type JSX, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import {
  exploreFamily,
  exploreMetrics,
  setExploreFamily,
  setExploreMetric,
} from "~/state/t4_ui";
import { EmptyState } from "./_shared/mod.ts";
import type { QueriesByFamily } from "./data_table/mod.ts";
import { MetricNav, metricNavGroups } from "./metric_nav";
import { MetricView } from "./metric_view";

const NATIONAL = "__national__";

function familiesInPackage(ctx: RunAuthoringContext): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) =>
    ctx.modules.some((m) => m.family === family)
  );
}

// The Explore page: one package at one scope, its families as tabs, each
// family's metrics in a left nav and the chosen metric's views on the right.
// The package starts at the pin (else the newest ready package) and the scope
// national on every mount; neither is stored, so a deleted package can never
// be a stored default. The family and the metric per family persist in
// t4_ui. Nothing here is written anywhere.
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
          controls={
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
          }
          gridQueries={gridQueries()}
          setGridQueries={setGridQueries}
        />
      )}
    </Show>
  );
}

// The heading bar's family tabs come from the package, so the bar renders
// them once the authoring context is in; the controls are there throughout.
function PackageExplorer(p: {
  scope: PackageScope;
  controls: JSX.Element;
  gridQueries: QueriesByFamily;
  setGridQueries: (queries: QueriesByFamily) => void;
}) {
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.scope.runId),
    t3(TC.loading),
  );
  const families = createMemo((): DatasetType[] => {
    const state = context.state();
    return state.status === "ready" ? familiesInPackage(state.data) : [];
  });
  const family = createMemo((): DatasetType | undefined =>
    families().includes(exploreFamily()) ? exploreFamily() : families()[0]
  );
  const tabs = () => {
    const value = family();
    return value === undefined ? undefined : {
      items: families().map((f) => ({ id: f, label: getModuleFamilyLabel(f) })),
      value,
      onChange: setExploreFamily,
    };
  };

  return (
    <FrameTop
      panelChildren={
        <HeadingBar compact tabs={tabs()}>
          {p.controls}
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={context.state()}>
        {(ctx: RunAuthoringContext) => (
          <Show
            when={family()}
            keyed
            fallback={
              <div class="ui-pad">
                <EmptyState kind="no_modules" />
              </div>
            }
          >
            {(f) => (
              <FamilyExplorer
                ctx={ctx}
                scope={p.scope}
                family={f}
                query={p.gridQueries[f]}
                setQuery={(q) => p.setGridQueries({ ...p.gridQueries, [f]: q })}
              />
            )}
          </Show>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}

// One family: its metric groups in the nav, the chosen one's views beside.
// The stored choice is resolved against the package on every read; a group
// the package lacks falls back to the family's first.
function FamilyExplorer(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
}) {
  const groups = createMemo(() => metricNavGroups(p.family, p.ctx));
  const group = createMemo(() => {
    const wanted = exploreMetrics()[p.family];
    return groups().find((g) => g.id === wanted) ?? groups()[0];
  });

  return (
    <FrameLeft
      panelChildren={
        <div class="ui-pad h-full w-64 overflow-y-auto">
          <MetricNav
            groups={groups()}
            value={group()?.id}
            onChange={(id) => setExploreMetric(p.family, id)}
          />
        </div>
      }
    >
      <Show
        when={group()}
        keyed
        fallback={
          <div class="ui-pad">
            <EmptyState kind="no_metric" />
          </div>
        }
      >
        {(g) => (
          <MetricView
            ctx={p.ctx}
            scope={p.scope}
            family={p.family}
            group={g}
            query={p.query}
            setQuery={p.setQuery}
          />
        )}
      </Show>
    </FrameLeft>
  );
}
