import {
  type DatasetType,
  EXPLORE_TYPE_LABELS,
  type ExploreViewBinding,
  exploreViewKey,
  type ExploreViewType,
  type ExploreViewTypeId,
  type FamilyQuery,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PackageScope,
  type RunAuthoringContext,
  t3,
  viewsForModule,
} from "lib";
import { ButtonGroup, FrameTop, SelectV2 } from "panther";
import { createMemo, type JSX, Show } from "solid-js";
import {
  exploreViewChoices,
  exploreViews,
  exploreViewTypes,
  setExploreView,
  setExploreViewChoices,
  setExploreViewType,
} from "~/state/t4_explore";
import { EmptyState } from "./_shared/mod.ts";
import { ViewFrame } from "./view_frame";

function moduleMetrics(
  module: InstalledModuleSummary,
  ctx: RunAuthoringContext,
): MetricWithStatus[] {
  return ctx.metrics
    .filter((m) => m.moduleId === module.id)
    .toSorted((a, b) => a.id.localeCompare(b.id));
}

// The three resolutions this pane makes, shared with the page's chat view
// state so the model is told what is on screen: a module with no ready
// metric shows no view; the stored view and type are resolved against the
// module's bindings on every read.
export function moduleHasReadyMetric(
  module: InstalledModuleSummary,
  ctx: RunAuthoringContext,
): boolean {
  return moduleMetrics(module, ctx).some((m) => m.status === "ready");
}

export function pickModuleView(
  moduleId: string,
  views: ExploreViewBinding[],
): ExploreViewBinding | undefined {
  return views.find((v) => v.id === exploreViews()[moduleId]) ?? views[0];
}

export function pickViewType(
  view: ExploreViewBinding,
  key: string,
): ExploreViewType {
  return view.types.find((t) => t.type === exploreViewTypes()[key]) ??
    view.types[0];
}

// The chosen module's views under the selectors row: the module select the
// page built, a `SelectV2` over the module's bindings (`viewsForModule`),
// and a `ButtonGroup` over the view's types when it offers more than one.
// The row is the pane's navigation below the family tabs, so the selects
// are at the default size in fixed-width wrappers. The stored view and type
// are resolved against the bindings on every read. A module with no view
// offered shows the no-view state, and one with no ready metric the stamped
// reason, each under the same row.
export function ModuleView(p: {
  ctx: RunAuthoringContext;
  scope: PackageScope;
  family: DatasetType;
  module: InstalledModuleSummary;
  moduleSelect: JSX.Element;
  query: FamilyQuery | undefined;
  setQuery: (query: FamilyQuery) => void;
}) {
  const metrics = createMemo(() => moduleMetrics(p.module, p.ctx));
  const views = createMemo(() => viewsForModule(p.module, p.ctx));
  const view = createMemo(() => pickModuleView(p.module.id, views()));

  return (
    <Show
      when={moduleHasReadyMetric(p.module, p.ctx)}
      fallback={
        <Fallback selectors={<SelectorsRow>{p.moduleSelect}</SelectorsRow>}>
          <EmptyState kind="no_metric" reason={metrics()[0]?.statusReason} />
        </Fallback>
      }
    >
      <Show
        when={view()}
        fallback={
          <Fallback selectors={<SelectorsRow>{p.moduleSelect}</SelectorsRow>}>
            <EmptyState kind="no_view" />
          </Fallback>
        }
      >
        {(v) => {
          const key = () => exploreViewKey(p.module.id, v().id);
          const type = createMemo(() => pickViewType(v(), key()));
          return (
            <ViewFrame
              ctx={p.ctx}
              scope={p.scope}
              family={p.family}
              binding={v()}
              typeId={type().type}
              query={p.query}
              setQuery={p.setQuery}
              choices={exploreViewChoices()[key()]}
              setChoices={(choices) => setExploreViewChoices(key(), choices)}
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

// The no-view and no-metric states sit under the selectors row where the
// frame puts it, so the module select is on screen in every branch.
function Fallback(p: { selectors: JSX.Element; children: JSX.Element }) {
  return (
    <FrameTop panelPad="md" panelChildren={p.selectors}>
      <div class="ui-pad">{p.children}</div>
    </FrameTop>
  );
}
