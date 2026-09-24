import {
  getMetricDisplayLabel,
  primaryMetricFor,
  t3,
  type DatasetType,
  type GridQuery,
  type MetricWithStatus,
  type PackageScope,
  type RunAuthoringContext,
} from "lib";
import { ButtonGroup, FrameTop } from "panther";
import { createMemo, createSignal, For, Show } from "solid-js";
import { EmptyState } from "./_shared/mod.ts";
import { DataTable } from "./data_table/mod.ts";
import type { MetricNavGroup } from "./metric_nav";

// A view is one way of reading a metric group. The data table is offered for
// the HMIS primary module's first ready metric and no other group has one
// yet. When module definitions declare views, `viewsFor` reads them instead
// and the rest of the page stands.
type ExploreView = { kind: "data_table"; label: string; metric: MetricWithStatus };
type ExploreViewKind = ExploreView["kind"];

function viewsFor(
  group: MetricNavGroup,
  family: DatasetType,
  ctx: RunAuthoringContext,
): ExploreView[] {
  const primary = family === "hmis" ? primaryMetricFor(family, ctx) : undefined;
  const metric = group.variants.find((m) => m.id === primary?.id);
  return metric === undefined ? [] : [{
    kind: "data_table",
    label: t3({
      en: "Data table",
      fr: "Tableau de données",
      pt: "Tabela de dados",
    }),
    metric,
  }];
}

type ViewProps = {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  query: GridQuery | undefined;
  setQuery: (query: GridQuery) => void;
};

// The chosen group's views: a toggle when it has more than one, the first
// otherwise, and a placeholder when it has none. A group with no ready
// variant shows its stamped reason instead.
export function MetricView(p: ViewProps & { group: MetricNavGroup }) {
  const views = createMemo(() => viewsFor(p.group, p.family, p.ctx));
  const [chosen, setChosen] = createSignal<ExploreViewKind | undefined>();
  const view = createMemo(() =>
    views().find((v) => v.kind === chosen()) ?? views()[0]
  );

  return (
    <Show
      when={p.group.variants.some((m) => m.status === "ready")}
      fallback={
        <div class="ui-pad">
          <EmptyState
            kind="no_metric"
            reason={p.group.variants[0]?.statusReason}
          />
        </div>
      }
    >
      <Show when={view()} keyed fallback={<Placeholder group={p.group} />}>
        {(v) => (
          <FrameTop
            panelChildren={
              <Show when={views().length > 1}>
                <div class="ui-pad">
                  <ButtonGroup
                    value={v.kind}
                    items={views().map((x) => ({ id: x.kind, label: x.label }))}
                    onChange={(kind) => {
                      if (kind !== undefined) setChosen(kind);
                    }}
                    size="sm"
                  />
                </div>
              </Show>
            }
          >
            <ViewBody
              view={v}
              ctx={p.ctx}
              scope={p.scope}
              family={p.family}
              query={p.query}
              setQuery={p.setQuery}
            />
          </FrameTop>
        )}
      </Show>
    </Show>
  );
}

function ViewBody(p: ViewProps & { view: ExploreView }) {
  switch (p.view.kind) {
    case "data_table":
      return (
        <DataTable
          ctx={p.ctx}
          scope={p.scope}
          family={p.family}
          metric={p.view.metric}
          query={p.query}
          setQuery={p.setQuery}
        />
      );
  }
}

function Placeholder(p: { group: MetricNavGroup }) {
  return (
    <div class="ui-pad ui-spy-sm text-sm">
      <div class="font-700">{p.group.label}</div>
      <div class="text-base-content-muted">
        {t3({
          en: "No view is built for this metric yet.",
          fr: "Aucune vue n'est encore construite pour cette métrique.",
          pt: "Ainda não há nenhuma vista construída para esta métrica.",
        })}
      </div>
      <Show when={p.group.variants.length > 1}>
        <ul class="text-base-content-muted">
          <For each={p.group.variants}>
            {(m) => <li>{getMetricDisplayLabel(m)}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
