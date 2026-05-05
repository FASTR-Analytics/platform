import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  getFetchConfigFromPresentationObjectConfig,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type ResultsValueForVisualization,
  type VizPreset,
} from "lib";
import {
  ChartHolder,
  Loading,
  type FigureInputs,
  type StateHolder,
} from "panther";
import { t3 } from "lib";
import { LabelHolder } from "panther";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { unwrap } from "solid-js/store";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { serverActions } from "~/server_actions";
import { _PO_ITEMS_CACHE } from "~/state/project/t2_presentation_objects";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { poItemsQueue } from "~/state/_infra/request_queue";

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
                <Loading noPad />
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
                  chartInputs={figureInputs}
                  height="ideal"
                  noRescaleWithWidthChange
                  scalePixelResolution={0.5}
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
              {t3({ en: "Custom", fr: "Personnalisé" })}
            </span>
          </div>
        </div>
        <div class="px-2 pb-2">
          <div class="font-700 text-xs">
            {t3({ en: "Custom", fr: "Personnalisé" })}
          </div>
          <div class="text-neutral text-xs">
            {t3({ en: "Configure manually", fr: "Configurer manuellement" })}
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
    d: { ...presetConfig.d },
    s: {
      ...DEFAULT_S_CONFIG,
      ...presetConfig.s,
      scale: (presetConfig.s?.scale ?? DEFAULT_S_CONFIG.scale) * 2,
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

  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: metric.resultsObjectId,
    fetchConfig: resFetchConfig.data,
  });

  let itemsHolder;
  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig: resFetchConfig.data,
        firstPeriodOption: metric.mostGranularTimePeriodColumnInResultsFile,
      }),
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      {
        projectId,
        resultsObjectId: metric.resultsObjectId,
        fetchConfig: resFetchConfig.data,
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
          ? t3({ en: "Too many data points", fr: "Trop de points de données" })
          : t3({ en: "No data available", fr: "Aucune donnée disponible" }),
    };
  }

  const resultsValueForViz: ResultsValueForVisualization = {
    formatAs: metric.formatAs,
    valueProps: metric.valueProps,
    valueLabelReplacements: metric.valueLabelReplacements,
  };

  let geoJson;
  const mapLevel = getAdminAreaLevelFromMapConfig(config);
  if (mapLevel) {
    geoJson = getGeoJsonSync(mapLevel);
  }

  return getFigureInputsFromPresentationObject(
    resultsValueForViz,
    itemsHolder,
    config,
    geoJson,
  );
}
