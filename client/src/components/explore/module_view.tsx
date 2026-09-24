import {
  getMetricDisplayLabel,
  primaryMetricFor,
  t3,
  type DatasetType,
  type GridColumns,
  type GridQuery,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import { Select } from "panther";
import { createMemo, createSignal, For, type JSX, Match, Show, Switch } from "solid-js";
import { EmptyState } from "./_shared/mod.ts";
import { DataTable } from "./data_table/mod.ts";
import { Timeseries } from "./timeseries";

// A view is one named reading of a module: a metric bound to a presentation.
// The HMIS primary module offers its first ready metric as a table of counts
// and as a timeseries, and no other module has a view yet. When module definitions declare
// views, `viewsFor` reads them instead and the rest of the page stands.
type ExploreView = { id: string; label: string; metric: MetricWithStatus } & (
  | { kind: "data_table"; columns: GridColumns }
  | { kind: "timeseries" }
);

function viewsFor(
  module: InstalledModuleSummary,
  family: DatasetType,
  ctx: RunAuthoringContext,
): ExploreView[] {
  const primary = family === "hmis" ? primaryMetricFor(family, ctx) : undefined;
  if (primary === undefined || primary.moduleId !== module.id) return [];
  return [
    {
      id: "indicator_values_counts",
      label: t3({
        en: "Indicator values as counts",
        fr: "Valeurs des indicateurs en effectifs",
        pt: "Valores dos indicadores em contagens",
      }),
      kind: "data_table",
      metric: primary,
      columns: "indicators",
    },
    {
      id: "indicator_values_over_time",
      label: t3({
        en: "Indicator values over time",
        fr: "Valeurs des indicateurs dans le temps",
        pt: "Valores dos indicadores ao longo do tempo",
      }),
      kind: "timeseries",
      metric: primary,
    },
  ];
}

function moduleMetrics(
  module: InstalledModuleSummary,
  ctx: RunAuthoringContext,
): MetricWithStatus[] {
  return ctx.metrics
    .filter((m) => m.moduleId === module.id)
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

type ViewProps = {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
};

// The chosen module's views behind a `Select` over their names, which the
// view places first in its own control row; a placeholder listing the
// module's metrics when it has none. A module with no ready metric shows
// the stamped reason instead.
export function ModuleView(p: ViewProps & { module: InstalledModuleSummary }) {
  const metrics = createMemo(() => moduleMetrics(p.module, p.ctx));
  const views = createMemo(() => viewsFor(p.module, p.family, p.ctx));
  const [chosen, setChosen] = createSignal<string | undefined>();
  const view = createMemo(() =>
    views().find((v) => v.id === chosen()) ?? views()[0]
  );

  return (
    <Show
      when={metrics().some((m) => m.status === "ready")}
      fallback={
        <div class="ui-pad">
          <EmptyState kind="no_metric" reason={metrics()[0]?.statusReason} />
        </div>
      }
    >
      <Show
        when={view()}
        fallback={<Placeholder module={p.module} metrics={metrics()} />}
      >
        {(v) => (
          <ViewBody
            view={v()}
            viewSelect={
              <Select
                value={v().id}
                options={views().map((x) => ({ value: x.id, label: x.label }))}
                onChange={setChosen}
                size="sm"
              />
            }
            ctx={p.ctx}
            scope={p.scope}
            family={p.family}
            query={p.query}
            setQuery={p.setQuery}
          />
        )}
      </Show>
    </Show>
  );
}

function ViewBody(p: ViewProps & { view: ExploreView; viewSelect: JSX.Element }) {
  return (
    <Switch>
      <Match when={p.view.kind === "data_table" ? p.view : undefined}>
        {(v) => (
          <DataTable
            ctx={p.ctx}
            scope={p.scope}
            family={p.family}
            metric={v().metric}
            columns={v().columns}
            viewSelect={p.viewSelect}
            query={p.query}
            setQuery={p.setQuery}
          />
        )}
      </Match>
      <Match when={p.view.kind === "timeseries" ? p.view : undefined}>
        {(v) => (
          <Timeseries
            ctx={p.ctx}
            scope={p.scope}
            family={p.family}
            metric={v().metric}
            viewSelect={p.viewSelect}
            query={p.query}
            setQuery={p.setQuery}
          />
        )}
      </Match>
    </Switch>
  );
}

function Placeholder(p: {
  module: InstalledModuleSummary;
  metrics: MetricWithStatus[];
}) {
  return (
    <div class="ui-pad ui-spy-sm text-sm">
      <div class="font-700">{p.module.label}</div>
      <div class="text-base-content-muted">
        {t3({
          en: "No view is built for this module yet. Its metrics:",
          fr: "Aucune vue n'est encore construite pour ce module. Ses métriques :",
          pt: "Ainda não há nenhuma vista construída para este módulo. As suas métricas:",
        })}
      </div>
      <ul class="text-base-content-muted">
        <For each={p.metrics}>
          {(m) => <li>{getMetricDisplayLabel(m)}</li>}
        </For>
      </ul>
    </div>
  );
}
