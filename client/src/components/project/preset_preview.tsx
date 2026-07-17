import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  getFetchConfigFromPresentationObjectConfig,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type VizPreset,
} from "lib";
import {
  ChartHolder,
  LoadingIndicator,
  type FigureInputs,
  type StateHolder,
} from "panther";
import { t3 } from "lib";
import { LabelHolder } from "panther";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import {
  getModuleIdForResultsObject,
  moduleDataVersionKey,
  projectState,
} from "~/state/project/t1_store";
import { buildFigureInputs, makeFigureBundleFromFetchedData } from "~/generate_visualization/mod";
import { serverActions } from "~/server_actions";
import { _PO_ITEMS_CACHE, resolveDefaultReplicant } from "~/state/project/t2_presentation_objects";
import { getInstanceLocalization } from "~/state/instance/t1_store";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { adaptFigureStyleForDarkMode } from "~/components/_shared/dark_mode_figures";

type Props = {
  projectId: string;
  metric: MetricWithStatus;
  preset: { config: VizPreset["config"] };
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
};

export function PresetPreview(p: Props) {
  const [state, setState] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
  });

  let version = 0;

  createEffect(() => {
    const preset = p.preset;
    const metric = p.metric;
    // Tracked version-key read — fetchPreview's cache-internal reads are untracked
    moduleDataVersionKey(
      projectState,
      getModuleIdForResultsObject(metric.resultsObjectId),
    );
    const thisVersion = ++version;
    setState({ status: "loading" });

    fetchPreview(p.projectId, metric, preset).then(
      (result) => {
        if (version === thisVersion) setState(result);
      },
      (err) => {
        if (version === thisVersion) {
          setState({
            status: "error",
            err: err instanceof Error ? err.message : "Error",
          });
        }
      },
    );
  });

  return (
    <div
      class={`bg-base-100 row-span-2 grid cursor-pointer grid-rows-subgrid rounded border transition-colors ${
        p.selected ? "border-primary" : "border-base-300 hover:border-primary"
      }`}
      onClick={p.onClick}
    >
      <div class="p-2">
        <div class="aspect-video overflow-hidden">
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
                <ChartHolder
                  chartInputs={adaptFigureStyleForDarkMode(figureInputs)}
                  height="ideal"
                  sizing="zoom"
                  />
              )}
            </Match>
          </Switch>
        </div>
      </div>
      <div class="px-2 pb-2">
        <div class="font-700 text-xs">{p.label}</div>
        <Show when={p.description}>
          <div class="text-neutral text-xs">{p.description}</div>
        </Show>
      </div>
    </div>
  );
}

export const CUSTOM_OPTION = "__custom__";

type PresetSelectorProps = {
  projectId: string;
  metric: MetricWithStatus;
  presets: {
    id: string;
    label: { en: string; fr: string };
    description: { en: string; fr: string };
    config: VizPreset["config"];
  }[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  label?: string;
};

export function PresetSelector(p: PresetSelectorProps) {
  return (
    <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      <For each={p.presets}>
        {(preset) => (
          <PresetPreview
            projectId={p.projectId}
            metric={p.metric}
            preset={preset}
            label={t3(preset.label)}
            description={t3(preset.description)}
            selected={p.selectedId === preset.id}
            onClick={() => p.onSelect(preset.id)}
          />
        )}
      </For>
      <div
        class={`bg-base-100 row-span-2 grid cursor-pointer grid-rows-subgrid rounded border transition-colors ${
          p.selectedId === CUSTOM_OPTION
            ? "border-primary"
            : "border-base-300 hover:border-primary"
        }`}
        onClick={() => p.onSelect(CUSTOM_OPTION)}
      >
        <div class="p-2">
          <div class="bg-base-200 flex aspect-video items-center justify-center rounded">
            <span class="text-neutral text-sm">
              {t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" })}
            </span>
          </div>
        </div>
        <div class="px-2 pb-2">
          <div class="font-700 text-xs">
            {t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" })}
          </div>
          <div class="text-neutral text-xs">
            {t3({ en: "Configure manually", fr: "Configurer manuellement", pt: "Configurar manualmente" })}
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchPreview(
  projectId: string,
  metric: MetricWithStatus,
  preset: { config: VizPreset["config"] },
): Promise<StateHolder<FigureInputs>> {
  const presetConfig = structuredClone(unwrap(preset.config));
  const config: PresentationObjectConfig = {
    d: presetConfig.d,
    s: {
      ...DEFAULT_S_CONFIG,
      ...presetConfig.s,
    },
    t: { ...DEFAULT_T_CONFIG },
  };

  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    metric,
    config,
  );
  if (!resFetchConfig.success) {
    return { status: "error", err: resFetchConfig.err };
  }

  // Replicant presets ship with no selected value; resolve to the first valid
  // option (same as the interactive viz) so the preview isn't querying the
  // "UNSELECTED" sentinel and rendering a false "No data available".
  const resolvedReplicant = await resolveDefaultReplicant(
    projectId,
    metric,
    config,
    resFetchConfig.data,
  );
  if (!resolvedReplicant.ok) {
    return {
      status: "error",
      err: t3({ en: "No data available", fr: "Aucune donnée disponible", pt: "Nenhum dado disponível" }),
    };
  }
  const fetchConfig = resolvedReplicant.fetchConfig;
  const effectiveConfig = resolvedReplicant.config;

  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: metric.resultsObjectId,
    fetchConfig,
  });

  let itemsHolder;
  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig,
        firstPeriodOption: metric.mostGranularTimePeriodColumnInResultsFile,
      }),
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      {
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig,
      },
      version,
    );

    const res = await newPromise;
    if (!res.success) {
      return { status: "error", err: res.err };
    }
    itemsHolder = res.data;
  }

  if (itemsHolder.status !== "ok") {
    return {
      status: "error",
      err:
        itemsHolder.status === "too_many_items"
          ? t3({ en: "Too many data points", fr: "Trop de points de données", pt: "Demasiados pontos de dados" })
          : t3({ en: "No data available", fr: "Aucune donnée disponible", pt: "Nenhum dado disponível" }),
    };
  }

  try {
    const bundle = makeFigureBundleFromFetchedData({
      resultsValue: metric,
      ih: itemsHolder as Parameters<typeof makeFigureBundleFromFetchedData>[0]["ih"],
      effectiveConfig,
    });
    return { status: "ready" as const, data: buildFigureInputs(bundle) };
  } catch (e) {
    return { status: "error" as const, err: e instanceof Error ? e.message : "Render error" };
  }
}
