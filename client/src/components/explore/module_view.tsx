import {
  type DatasetType,
  deriveViewConfig,
  EXPLORE_TYPE_LABELS,
  type ExplorePossibleValues,
  type ExploreViewBinding,
  exploreViewKey,
  type ExploreViewTypeId,
  type FamilyQuery,
  getMetricDisplayLabel,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PackageScope,
  resolveView,
  type ResolveViewInput,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContext,
  scopeAreaForFamily,
  t3,
  type ViewChoices,
  viewsForModule,
} from "lib";
import {
  ButtonGroup,
  FrameTop,
  getLanguage,
  SelectV2,
  StateHolderWrapper,
} from "panther";
import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import { instanceState, resolveScope } from "~/state/instance/t1_store";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import {
  exploreViewChoices,
  exploreViews,
  exploreViewTypes,
  setExploreView,
  setExploreViewChoices,
  setExploreViewType,
} from "~/state/t4_explore";
import { createTrackedQuery, queryEditors } from "./_shared/mod.ts";
import { DataTable } from "./data_table/mod.ts";
import { EmptyState } from "./empty_state";
import { Timeseries } from "./timeseries";

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
  query: FamilyQuery | undefined;
  setQuery: (query: FamilyQuery) => void;
};

// The chosen module's views under the selectors row: the module select the
// page built, a `SelectV2` over the module's bindings (`viewsForModule`),
// and a `ButtonGroup` over the view's types when it offers more than one.
// The row is the pane's navigation below the family tabs, so the selects
// are at the default size in fixed-width wrappers. The stored view and type
// are resolved against the bindings on every read. A module with no view
// shows a placeholder listing its metrics, and one with no ready metric the
// stamped reason, each under the same row.
export function ModuleView(
  p: ViewProps & { module: InstalledModuleSummary; moduleSelect: JSX.Element },
) {
  const metrics = createMemo(() => moduleMetrics(p.module, p.ctx));
  const views = createMemo(() => viewsForModule(p.module, p.ctx));
  const view = createMemo(() =>
    views().find((v) => v.id === exploreViews()[p.module.id]) ?? views()[0]
  );

  return (
    <Show
      when={metrics().some((m) => m.status === "ready")}
      fallback={
        <Fallback selectors={<SelectorsRow>{p.moduleSelect}</SelectorsRow>}>
          <div class="ui-pad">
            <EmptyState kind="no_metric" reason={metrics()[0]?.statusReason} />
          </div>
        </Fallback>
      }
    >
      <Show
        when={view()}
        fallback={
          <Fallback selectors={<SelectorsRow>{p.moduleSelect}</SelectorsRow>}>
            <Placeholder module={p.module} metrics={metrics()} />
          </Fallback>
        }
      >
        {(v) => {
          const key = () => exploreViewKey(p.module.id, v().id);
          const type = createMemo(() =>
            v().types.find((t) => t.type === exploreViewTypes()[key()]) ??
              v().types[0]
          );
          return (
            <ViewBody
              ctx={p.ctx}
              scope={p.scope}
              family={p.family}
              binding={v()}
              typeId={type().type}
              choices={exploreViewChoices()[key()]}
              setChoices={(choices) => setExploreViewChoices(key(), choices)}
              query={p.query}
              setQuery={p.setQuery}
              selectors={
                <SelectorsRow>
                  {p.moduleSelect}
                  <div class="w-[28rem] max-w-full">
                    <SelectV2
                      items={views().map((x) => ({
                        id: x.id,
                        label: t3(x.label),
                      }))}
                      value={v().id}
                      onChange={(id) => setExploreView(p.module.id, id)}
                      fullWidth
                    />
                  </div>
                  <Show when={v().types.length > 1}>
                    <ButtonGroup<ExploreViewTypeId>
                      value={type().type}
                      items={v().types.map((t) => ({
                        id: t.type,
                        label: t3(EXPLORE_TYPE_LABELS[t.type]),
                      }))}
                      onChange={(id) => {
                        if (id !== undefined) setExploreViewType(key(), id);
                      }}
                    />
                  </Show>
                </SelectorsRow>
              }
            />
          );
        }}
      </Show>
    </Show>
  );
}

// It wraps because the selects have fixed widths.
function SelectorsRow(p: { children: JSX.Element }) {
  return <div class="ui-gap-sm flex flex-wrap items-center">{p.children}</div>;
}

// The placeholder and the no-metric state sit under the selectors row where
// the views put it, so the module select is on screen in every branch.
function Fallback(p: { selectors: JSX.Element; children: JSX.Element }) {
  return (
    <FrameTop panelPad="md" panelChildren={p.selectors}>
      {p.children}
    </FrameTop>
  );
}

type BodyProps = ViewProps & {
  binding: ExploreViewBinding;
  typeId: ExploreViewTypeId;
  choices: ViewChoices | undefined;
  setChoices: (choices: ViewChoices) => void;
  selectors: JSX.Element;
};

// One view: the active metric is resolved first, without possible values,
// which it does not depend on; its metric info is read once, tracked, and
// the view is resolved again under the metric's own possible values.
function ViewBody(p: BodyProps) {
  const input = createMemo((): Omit<ResolveViewInput, "possibleValues"> => ({
    binding: p.binding,
    family: p.family,
    type: p.typeId,
    query: p.query,
    choices: p.choices,
    scopeArea: scopeAreaForFamily(resolveScope(p.scope).areas, p.family),
    ctx: p.ctx,
  }));
  const metric = createMemo(() =>
    resolveView({ ...input(), possibleValues: {} })?.metric
  );
  return (
    <Show
      when={metric()}
      keyed
      fallback={
        <Fallback selectors={p.selectors}>
          <div class="ui-pad">
            <EmptyState kind="no_metric" />
          </div>
        </Fallback>
      }
    >
      {(m) => {
        const info = createTrackedQuery(() =>
          getResultsValueInfoForPresentationObjectFromCacheOrFetch(
            p.scope,
            m.id,
          )
        );
        return (
          <StateHolderWrapper state={info()} loadingAndErrorPad="md">
            {(metricInfo) => (
              <ReadyView {...p} info={metricInfo} input={input()} />
            )}
          </StateHolderWrapper>
        );
      }}
    </Show>
  );
}

// HFA rounds take the instance's declared order; one the instance no longer
// lists goes last.
function hfaTimePointsInOrder<T extends { id: string }>(values: T[]): T[] {
  const order = new Map(
    instanceState.hfaTimePoints.map((tp) => [tp.label, tp.sortOrder]),
  );
  return values.toSorted((a, b) =>
    (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
  );
}

function explorePossibleValues(
  info: ResultsValueInfoForPresentationObject,
): ExplorePossibleValues {
  const served = info.disaggregationPossibleValues;
  const timePoints = served.time_point;
  return timePoints?.status === "ok"
    ? {
      ...served,
      time_point: {
        status: "ok",
        values: hfaTimePointsInOrder(timePoints.values),
      },
    }
    : served;
}

function ReadyView(
  p: BodyProps & {
    info: ResultsValueInfoForPresentationObject;
    input: Omit<ResolveViewInput, "possibleValues">;
  },
) {
  const view = createMemo(() =>
    resolveView({
      ...p.input,
      possibleValues: explorePossibleValues(p.info),
    })
  );
  const derived = createMemo(() => {
    const v = view();
    return v === undefined ? undefined : deriveViewConfig(v, getLanguage());
  });

  return (
    <Show
      when={view()}
      fallback={
        <Fallback selectors={p.selectors}>
          <div class="ui-pad">
            <EmptyState kind="no_metric" />
          </div>
        </Fallback>
      }
    >
      {(v) => {
        const { update, clearDropped } = queryEditors(
          () => p.query ?? v().query,
          () => v().droppedIndicators,
          p.setQuery,
        );
        // The family's indicators live in the family query; any other
        // category's values are the view's own.
        const onCategoryChange = (ids: string[]) => {
          if (v().category?.isIndicator === false) {
            p.setChoices({ ...(p.choices ?? { pinned: {} }), category: ids });
          } else {
            update({ indicators: ids });
          }
        };
        return (
          <Switch>
            <Match when={v().type.type === "table"}>
              <DataTable
                scope={p.scope}
                family={p.family}
                view={v()}
                derived={derived()}
                info={p.info}
                selectors={p.selectors}
                onChange={update}
                onCategoryChange={onCategoryChange}
                onClearDropped={clearDropped}
              />
            </Match>
            <Match when={v().type.type === "timeseries"}>
              <Timeseries
                scope={p.scope}
                view={v()}
                derived={derived()}
                selectors={p.selectors}
                onChange={update}
                onCategoryChange={onCategoryChange}
                onClearDropped={clearDropped}
              />
            </Match>
          </Switch>
        );
      }}
    </Show>
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
          fr:
            "Aucune vue n'est encore construite pour ce module. Ses métriques :",
          pt:
            "Ainda não há nenhuma vista construída para este módulo. As suas métricas:",
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
