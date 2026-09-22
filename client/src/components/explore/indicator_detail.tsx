import {
  t3,
  type DisaggregationOption,
  type MetricWithStatus,
  type PackageScope,
  type VizPreset,
} from "lib";
import { FigureHolder, LoadingIndicator, type FigureInputs } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { createFigurePreview } from "~/components/_shared/mod.ts";
import {
  filteredToIndicator,
  presetConfig,
  withPeriod,
  type PeriodChoice,
} from "./explore_query";

// The selected indicator's detail: every other preset of the scorecard
// metric, pinned to the indicator and the chosen period, rendered as the
// figures a product would insert.
export function IndicatorDetail(p: {
  scope: PackageScope;
  metric: MetricWithStatus;
  presets: VizPreset[];
  indicatorDimension: DisaggregationOption;
  indicatorId: string;
  indicatorLabel: string;
  periodChoice: PeriodChoice | undefined;
}) {
  return (
    <div class="ui-spy-sm">
      <div class="font-700">{p.indicatorLabel}</div>
      <Show
        when={p.presets.length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "This metric has no further visualizations for one indicator",
              fr: "Cet indicateur n'a pas d'autres visualisations pour un seul indicateur",
              pt: "Esta métrica não tem mais visualizações para um indicador",
            })}
          </div>
        }
      >
        <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(24rem,1fr))]">
          <For each={p.presets}>
            {(preset) => (
              <div class="bg-base-100 rounded border p-2">
                <div class="aspect-video overflow-hidden">
                  <DetailFigure
                    scope={p.scope}
                    metric={p.metric}
                    preset={preset}
                    indicatorDimension={p.indicatorDimension}
                    indicatorId={p.indicatorId}
                    periodChoice={p.periodChoice}
                  />
                </div>
                <div class="ui-text-caption truncate pt-1">
                  {t3(preset.label)}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function DetailFigure(p: {
  scope: PackageScope;
  metric: MetricWithStatus;
  preset: VizPreset;
  indicatorDimension: DisaggregationOption;
  indicatorId: string;
  periodChoice: PeriodChoice | undefined;
}) {
  const state = createFigurePreview(() => ({
    scope: p.scope,
    metric: p.metric,
    config: withPeriod(
      filteredToIndicator(
        presetConfig(p.preset),
        p.indicatorDimension,
        p.indicatorId,
      ),
      p.periodChoice,
    ),
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
        when={state().status === "ready" &&
          (state() as { data: FigureInputs }).data}
        keyed
      >
        {(figureInputs) => (
          <FigureHolder figureInputs={figureInputs} height="ideal" sizing="zoom" />
        )}
      </Match>
    </Switch>
  );
}
