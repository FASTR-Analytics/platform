import {
  t3,
  type DerivedDefaultVisualization,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type RunAuthoringContext,
} from "lib";
import {
  FigureHolder,
  LoadingIndicator,
  getEditorWrapper,
  type FigureInputs,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { VisualizationEditor } from "~/components/_shared/figure_editor/mod.ts";
import { createFigurePreview } from "~/components/_shared/mod.ts";

// One module's default visualizations (the entries of the package's
// `RunAuthoringContext.presets` whose metric the module produced, in preset
// order), rendered under the page scope. A default whose metric is stamped
// unavailable shows the stamped reason and is not clickable.
//
// Clicking a card puts the default in the figure editor as a viewer: the
// user can disaggregate it differently to look at, and closing returns
// nothing. The page keeps no draft and nothing is written anywhere.
export function ModuleVisualizations(p: {
  presets: DerivedDefaultVisualization[];
  ctx: RunAuthoringContext;
  scope: PackageScope;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  function openDefault(
    preset: DerivedDefaultVisualization,
    metric: MetricWithStatus,
  ): void {
    void p.openEditor({
      element: VisualizationEditor,
      props: {
        label: metric.label,
        scope: p.scope,
        metric,
        configSnapshot: structuredClone(preset.config),
        authoringContext: p.ctx,
        viewOnly: true,
      },
    });
  }

  return (
    <Show
      when={p.presets.length > 0}
      fallback={
        <div class="text-base-content-muted text-sm">
          {t3({
            en: "This module has no default visualizations",
            fr: "Ce module n'a aucune visualisation par défaut",
            pt: "Este módulo não tem visualizações predefinidas",
          })}
        </div>
      }
    >
      <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
        <For each={p.presets}>
          {(preset) => (
            <DefaultVisualizationCard
              preset={preset}
              metric={p.ctx.metrics.find((m) => m.id === preset.metricId)}
              scope={p.scope}
              onOpen={(metric) => openDefault(preset, metric)}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

function DefaultVisualizationCard(p: {
  preset: DerivedDefaultVisualization;
  metric: MetricWithStatus | undefined;
  scope: PackageScope;
  onOpen: (metric: MetricWithStatus) => void;
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
    <div
      class="bg-base-100 data-[open=true]:hover:border-primary rounded border transition-colors data-[open=true]:cursor-pointer"
      data-open={availableMetric() !== undefined}
      onClick={() => {
        const metric = availableMetric();
        if (metric !== undefined) p.onOpen(metric);
      }}
    >
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
                config={p.preset.config}
              />
            )}
          </Show>
        </div>
      </div>
      <div class="px-2 pb-2">
        <div class="font-700 truncate text-sm">{p.preset.label}</div>
        <Show when={p.metric} keyed>
          {(metric) => (
            <div class="ui-text-caption truncate">{metric.label}</div>
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
          state().status === "ready" && (state() as { data: FigureInputs }).data
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
