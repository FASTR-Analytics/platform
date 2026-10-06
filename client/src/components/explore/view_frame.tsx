import {
  type DatasetType,
  deriveViewConfig,
  type ExplorePossibleValues,
  type ExploreViewBinding,
  type ExploreViewTypeId,
  type FamilyQuery,
  type MetricWithStatus,
  type PackageScope,
  resolveView,
  type ResolveViewInput,
  type ResultsValueInfoForPresentationObject,
  type RunAuthoringContext,
  scopeAreaForFamily,
  type ViewChoices,
} from "lib";
import { FrameTop, getLanguage, StateHolderWrapper } from "panther";
import {
  createMemo,
  createSignal,
  type JSX,
  Match,
  Show,
  Switch,
} from "solid-js";
import { instanceState, resolveScope } from "~/state/instance/t1_store";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import { createTrackedQuery, EmptyState } from "./_shared/mod.ts";
import { DataTable } from "./data_table/mod.ts";
import { FigureView } from "./figure_view";
import { TableTools, Toolbar } from "./toolbar";

export type ViewFrameProps = {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  binding: ExploreViewBinding;
  typeId: ExploreViewTypeId;
  query: FamilyQuery | undefined;
  setQuery: (query: FamilyQuery) => void;
  choices: ViewChoices | undefined;
  setChoices: (choices: ViewChoices) => void;
  selectors: JSX.Element;
};

// One view: the frame owns the metric info read, the toolbar and the body.
// The active metric is resolved first, without possible values, which it
// does not depend on; its metric info is read once, tracked; the view is
// resolved again under the metric's own possible values, and the body by
// type takes the derived config.
export function ViewFrame(p: ViewFrameProps) {
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
        <FrameTop panelPad="md" panelChildren={p.selectors}>
          <div class="ui-pad">
            <EmptyState kind="no_metric" />
          </div>
        </FrameTop>
      }
    >
      {(m) => <MetricFrame {...p} metric={m} input={input()} />}
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

// Editors over the family query. `intent` is the stored query, or the
// resolved one until the user edits. `update` keeps the indicators the
// package lacks, so a choice survives a package switch; `clearDropped`
// forgets them.
function queryEditors(
  intent: () => FamilyQuery,
  dropped: () => string[],
  setQuery: (query: FamilyQuery) => void,
) {
  return {
    update: (patch: Partial<FamilyQuery>) =>
      setQuery({
        ...intent(),
        ...patch,
        ...(patch.indicators === undefined ? {} : {
          indicators: [...patch.indicators, ...dropped()],
        }),
      }),
    clearDropped: () => {
      const gone = new Set(dropped());
      setQuery({
        ...intent(),
        indicators: intent().indicators.filter((id) => !gone.has(id)),
      });
    },
  };
}

function MetricFrame(
  p: ViewFrameProps & {
    metric: MetricWithStatus;
    input: Omit<ResolveViewInput, "possibleValues">;
  },
) {
  const info = createTrackedQuery(() =>
    getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      p.scope,
      p.metric.id,
    )
  );
  const possibleValues = createMemo((): ExplorePossibleValues => {
    const state = info();
    return state.status === "ready" ? explorePossibleValues(state.data) : {};
  });
  const view = createMemo(() =>
    resolveView({ ...p.input, possibleValues: possibleValues() })
  );
  const derived = createMemo(() => {
    const v = view();
    return v === undefined ? undefined : deriveViewConfig(v, getLanguage());
  });
  const [find, setFind] = createSignal("");
  const [download, setDownload] = createSignal<(() => void) | undefined>(
    undefined,
  );

  return (
    <Show
      when={view()}
      fallback={
        <FrameTop panelPad="md" panelChildren={p.selectors}>
          <div class="ui-pad">
            <EmptyState kind="no_metric" />
          </div>
        </FrameTop>
      }
    >
      {(v) => {
        const { update, clearDropped } = queryEditors(
          () => p.query ?? v().query,
          () => v().droppedIndicators,
          p.setQuery,
        );
        const choices = (): ViewChoices => p.choices ?? { pinned: {} };
        // The family's indicators live in the family query; any other
        // category's values are the view's own.
        const onCategory = (ids: string[]) => {
          if (v().category?.isIndicator === false) {
            p.setChoices({ ...choices(), category: ids });
          } else {
            update({ indicators: ids });
          }
        };
        return (
          <FrameTop
            panelPad="md"
            panelSpy="sm"
            panelChildren={
              <Toolbar
                selectors={p.selectors}
                tools={
                  <Show when={v().type.type === "table"}>
                    <TableTools
                      find={find()}
                      onFind={setFind}
                      onDownload={download()}
                    />
                  </Show>
                }
                view={v()}
                family={p.family}
                onQuery={update}
                onCategory={onCategory}
                onSwitch={(id) => p.setChoices({ ...choices(), switch: id })}
                onPin={(dimension, value) =>
                  p.setChoices({
                    ...choices(),
                    pinned: { ...choices().pinned, [dimension]: value },
                  })}
                onClearDropped={clearDropped}
              />
            }
          >
            <StateHolderWrapper state={info()} loadingAndErrorPad="md">
              {(metricInfo) => (
                <Show
                  when={derived()}
                  fallback={
                    <div class="ui-pad">
                      <EmptyState kind="no_data_available" />
                    </div>
                  }
                >
                  {(d) => (
                    <Switch>
                      <Match when={v().type.type === "table"}>
                        <DataTable
                          scope={p.scope}
                          family={p.family}
                          derived={d()}
                          info={metricInfo}
                          find={find()}
                          setDownload={(fn) => setDownload(() => fn)}
                        />
                      </Match>
                      <Match when={v().type.type === "timeseries"}>
                        <FigureView scope={p.scope} view={v()} derived={d()} />
                      </Match>
                    </Switch>
                  )}
                </Show>
              )}
            </StateHolderWrapper>
          </FrameTop>
        );
      }}
    </Show>
  );
}
