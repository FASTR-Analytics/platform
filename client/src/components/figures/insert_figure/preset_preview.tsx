import {
  t3,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
} from "lib";
import {
  FigureHolder,
  LoadingIndicator,
  type FigureInputs,
  type StateHolder,
} from "panther";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import {
  buildFigureInputs,
  makeFigureBundleFromFetchedData,
} from "~/generate_visualization/mod";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";

export const CUSTOM_OPTION = "__custom__";

export type PresetOption = {
  id: string;
  label: string;
  description: string | undefined;
  config: PresentationObjectConfig;
};

type Props = {
  scope: PackageScope;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
  label: string;
  description: string | undefined;
  selected: boolean;
  onClick: () => void;
};

// A preset is not a row and has no detail read (D6): it renders through the
// same scope-keyed items read as any inserted figure, so a gallery of
// previews and the figure a user then inserts share cache entries.
export function PresetPreview(p: Props) {
  const [state, setState] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
  });

  let version = 0;

  createEffect(() => {
    const scope = p.scope;
    const metric = p.metric;
    const config = p.config;
    const thisVersion = ++version;
    setState({ status: "loading" });

    fetchPreview(scope, metric, config).then(
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
        p.selected ? "border-primary" : "hover:border-primary"
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
                <FigureHolder
                  figureInputs={figureInputs}
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
          <div class="ui-text-caption">{p.description}</div>
        </Show>
      </div>
    </div>
  );
}

type PresetSelectorProps = {
  scope: PackageScope;
  metric: MetricWithStatus;
  presets: PresetOption[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
};

export function PresetSelector(p: PresetSelectorProps) {
  return (
    <div class="ui-gap grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      <For each={p.presets}>
        {(preset) => (
          <PresetPreview
            scope={p.scope}
            metric={p.metric}
            config={preset.config}
            label={preset.label}
            description={preset.description}
            selected={p.selectedId === preset.id}
            onClick={() => p.onSelect(preset.id)}
          />
        )}
      </For>
      <div
        class={`bg-base-100 row-span-2 grid cursor-pointer grid-rows-subgrid rounded border transition-colors ${
          p.selectedId === CUSTOM_OPTION
            ? "border-primary"
            : "hover:border-primary"
        }`}
        onClick={() => p.onSelect(CUSTOM_OPTION)}
      >
        <div class="p-2">
          <div class="bg-base-200 flex aspect-video items-center justify-center rounded">
            <span class="text-base-content-muted text-sm">
              {t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" })}
            </span>
          </div>
        </div>
        <div class="px-2 pb-2">
          <div class="font-700 text-xs">
            {t3({ en: "Custom", fr: "Personnalisé", pt: "Personalizado" })}
          </div>
          <div class="ui-text-caption">
            {t3({
              en: "Configure manually",
              fr: "Configurer manuellement",
              pt: "Configurar manualmente",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchPreview(
  scope: PackageScope,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<StateHolder<FigureInputs>> {
  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(scope, metric, config);
  if (!itemsRes.success) {
    return { status: "error", err: itemsRes.err };
  }
  const { ih, config: effectiveConfig } = itemsRes.data;
  if (ih.status !== "ok") {
    return {
      status: "error",
      err:
        ih.status === "too_many_items"
          ? t3({
              en: "Too many data points",
              fr: "Trop de points de données",
              pt: "Demasiados pontos de dados",
            })
          : t3({
              en: "No data available",
              fr: "Aucune donnée disponible",
              pt: "Nenhum dado disponível",
            }),
    };
  }

  try {
    const bundle = makeFigureBundleFromFetchedData(scope, {
      resultsValue: metric,
      ih,
      effectiveConfig,
    });
    return { status: "ready" as const, data: buildFigureInputs(bundle) };
  } catch (e) {
    return {
      status: "error" as const,
      err: e instanceof Error ? e.message : "Render error",
    };
  }
}
