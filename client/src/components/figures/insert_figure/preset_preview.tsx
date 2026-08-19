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
import { getFigureInputsFromCacheOrFetch } from "~/state/products/t2_figure_data";

type Props = {
  scope: PackageScope;
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
  label: string;
  description: string | undefined;
  selected: boolean;
  onClick: () => void;
};

// A preset renders through the same run-keyed items read as any other figure —
// a preset is not a row and has no detail read (D6). The entries are keyed by
// `(runId, scopeToken, …)` with a constant version, so a gallery of previews
// and the figure a user later inserts share cache entries.
export function PresetPreview(p: Props) {
  const [state, setState] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
  });

  let requestId = 0;

  createEffect(async () => {
    const scope = p.scope;
    const metric = p.metric;
    const config = p.config;
    const thisRequest = ++requestId;
    setState({ status: "loading" });
    const res = await getFigureInputsFromCacheOrFetch(
      scope,
      metric,
      config,
      undefined,
    );
    if (thisRequest !== requestId) return;
    setState(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
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

export const CUSTOM_OPTION = "__custom__";

type PresetOption = {
  id: string;
  label: string;
  description: string | undefined;
  config: PresentationObjectConfig;
};

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
