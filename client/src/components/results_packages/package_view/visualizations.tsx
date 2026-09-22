import {
  t3,
  TC,
  type DerivedDefaultVisualization,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type RunAuthoringContext,
  type RunListingItem,
} from "lib";
import {
  Button,
  FigureHolder,
  LoadingIndicator,
  StateHolderWrapper,
  createQuery,
  getEditorWrapper,
  type FigureInputs,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { VisualizationEditor } from "~/components/_shared/figure_editor/mod.ts";
import {
  ScopePicker,
  createFigurePreview,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/mod.ts";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";

// Every default visualization of a READY package (`RunAuthoringContext.presets`,
// in catalog order, no filter), rendered under the page scope. The scope
// starts national and lives here, never stored; a half-chosen single-area
// selection keeps rendering the last complete pair.
//
// Edit opens the figure editor with nothing behind it: no collab binding, no
// save target. Apply replaces the card's working config, held here by default
// id and gone with the page; Reset drops it. Nothing is written anywhere.
export function PackageVisualizations(p: {
  run: RunListingItem;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const context = createQuery(
    () => getRunAuthoringContextFromCacheOrFetch(p.run.id),
    t3(TC.loading),
  );

  const [selection, setSelection] = createSignal<ScopeSelection>({
    mode: "national",
  });
  const [adminArea2, setAdminArea2] = createSignal<string | null>(null);
  function changeScope(next: ScopeSelection): void {
    setSelection(next);
    const stored = storedValueFromScopeSelection(next);
    if (stored !== undefined) setAdminArea2(stored);
  }
  const scope = (): PackageScope => ({
    runId: p.run.id,
    adminArea2: adminArea2(),
  });

  const [edits, setEdits] = createSignal<
    Record<string, PresentationObjectConfig>
  >({});
  const workingConfig = (preset: DerivedDefaultVisualization) =>
    edits()[preset.id] ?? preset.config;

  async function editDefault(
    preset: DerivedDefaultVisualization,
    metric: MetricWithStatus,
    authoringContext: RunAuthoringContext,
  ): Promise<void> {
    const result = await p.openEditor({
      element: VisualizationEditor,
      props: {
        label: metric.label,
        scope: scope(),
        metric,
        configSnapshot: structuredClone(workingConfig(preset)),
        authoringContext,
      },
    });
    if (result?.updated) {
      const config = result.updated.config;
      setEdits((prev) => ({ ...prev, [preset.id]: config }));
    }
  }

  function resetDefault(preset: DerivedDefaultVisualization): void {
    setEdits((prev) => {
      const { [preset.id]: _dropped, ...rest } = prev;
      return rest;
    });
  }

  return (
    <div class="ui-spy-sm">
      <div class="font-700">
        {t3({
          en: "Visualizations",
          fr: "Visualisations",
          pt: "Visualizações",
        })}
      </div>
      <ScopePicker selection={selection()} onChange={changeScope} />
      <StateHolderWrapper state={context.state()} noPad>
        {(ctx: RunAuthoringContext) => (
          <Show
            when={ctx.presets.length > 0}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "This package has no default visualizations",
                  fr: "Ce paquet n'a aucune visualisation par défaut",
                  pt: "Este pacote não tem visualizações predefinidas",
                })}
              </div>
            }
          >
            <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
              <For each={ctx.presets}>
                {(preset) => (
                  <DefaultVisualizationCard
                    preset={preset}
                    metric={ctx.metrics.find((m) => m.id === preset.metricId)}
                    scope={scope()}
                    config={workingConfig(preset)}
                    edited={edits()[preset.id] !== undefined}
                    onEdit={(metric) => void editDefault(preset, metric, ctx)}
                    onReset={() => resetDefault(preset)}
                  />
                )}
              </For>
            </div>
          </Show>
        )}
      </StateHolderWrapper>
    </div>
  );
}

function DefaultVisualizationCard(p: {
  preset: DerivedDefaultVisualization;
  metric: MetricWithStatus | undefined;
  scope: PackageScope;
  config: PresentationObjectConfig;
  edited: boolean;
  onEdit: (metric: MetricWithStatus) => void;
  onReset: () => void;
}) {
  const availableMetric = () =>
    p.metric?.status === "ready" ? p.metric : undefined;
  const unavailableReason = () =>
    p.metric?.statusReason ??
    t3({
      en: "This metric is not available in this package",
      fr: "Cet indicateur n'est pas disponible dans ce paquet",
      pt: "Este indicador não está disponível neste pacote",
    });

  return (
    <div class="bg-base-100 rounded border">
      <div class="p-2">
        <div class="aspect-video overflow-hidden">
          <Show
            when={availableMetric()}
            keyed
            fallback={
              <div class="text-base-content-muted flex h-full items-center justify-center text-center text-sm">
                {unavailableReason()}
              </div>
            }
          >
            {(metric) => (
              <FigurePreview
                scope={p.scope}
                metric={metric}
                config={p.config}
              />
            )}
          </Show>
        </div>
      </div>
      <div class="ui-gap-sm flex items-end px-2 pb-2">
        <div class="min-w-0 flex-1">
          <div class="font-700 truncate text-sm">{p.preset.label}</div>
          <Show when={p.metric} keyed>
            {(metric) => (
              <div class="ui-text-caption truncate">{metric.label}</div>
            )}
          </Show>
        </div>
        <Show when={availableMetric()} keyed>
          {(metric) => (
            <>
              <Show when={p.edited}>
                <Button size="sm" outline onClick={p.onReset}>
                  {t3({ en: "Reset", fr: "Réinitialiser", pt: "Repor" })}
                </Button>
              </Show>
              <Button
                size="sm"
                outline
                iconName="pencil"
                onClick={() => p.onEdit(metric)}
              >
                {t3(TC.edit)}
              </Button>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

function FigurePreview(p: {
  scope: PackageScope;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
}) {
  const state = createFigurePreview(() => ({
    scope: p.scope,
    metric: p.metric,
    config: p.config,
  }));
  return (
    <Switch>
      <Match when={state().status === "loading"}>
        <div class="flex h-full items-center justify-center">
          <LoadingIndicator noPad />
        </div>
      </Match>
      <Match when={state().status === "error"}>
        <div class="text-danger flex h-full items-center justify-center text-center text-xs">
          {(state() as { err: string }).err}
        </div>
      </Match>
      <Match
        when={
          state().status === "ready" &&
          (state() as { data: FigureInputs }).data
        }
        keyed
      >
        {(figureInputs) => (
          <FigureHolder
            figureInputs={figureInputs}
            height="ideal"
            sizing="zoom"
          />
        )}
      </Match>
    </Switch>
  );
}
