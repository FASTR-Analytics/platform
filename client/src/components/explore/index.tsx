import {
  groupMetricsByModule,
  t3,
  type MetricGroup,
  type MetricWithStatus,
  type ModuleId,
  type PackageScope,
  type PresentationObjectConfig,
  type RunAuthoringContext,
} from "lib";
import {
  Button,
  EmptyState,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  Select,
  StateHolderWrapper,
  getEditorWrapper,
  openComponent,
  type OpenEditorProps,
  type StateHolder,
} from "panther";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onMount,
} from "solid-js";
import { unwrap } from "solid-js/store";
import { copilotViewController } from "~/components/copilot/ai_views";
import {
  ScopePicker,
  scopeSelectionFromStored,
  storedValueFromScopeSelection,
  type ScopeSelection,
} from "~/components/_shared/scope_picker";
import { VisualizationEditor } from "~/components/figure_editor";
import {
  InsertFigureModal,
  MetricCard,
  ModuleSidebar,
  PresetPreview,
} from "~/components/figures/insert_figure";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import {
  exploreAdminArea2,
  exploreRunId,
  setExploreAdminArea2,
  setExploreRunId,
  setShowAi,
  showAi,
} from "~/state/t4_ui";
import { AddToProductModal } from "./add_to_product_modal";
import { MetricDetailsModal } from "./metric_details_modal";

// The standalone place to look at a chart (D6). The `(package, scope)` pair is
// EPHEMERAL — it starts at the pin and national, lives in t4 signals purely so
// a tab switch does not lose it, and is never persisted or written to a
// product. Presets are not products: no rows, no detail read; the gallery is
// the run's own derived default visualizations, rendered through the run-keyed
// items read with their own config.
export function Explore() {
  const { openEditor: openFigureEditor, EditorWrapper: FigureEditorWrapper } =
    getEditorWrapper();

  onMount(() => copilotViewController.setView("viewing_explore"));

  const [searchText, setSearchText] = createSignal<string>("");
  const [selectedModule, setSelectedModule] = createSignal<ModuleId | "all">(
    "all",
  );
  const [selectedMetricId, setSelectedMetricId] = createSignal<string>("");
  const [selectedPresetId, setSelectedPresetId] = createSignal<string>("");

  // The package Select's options are the ready list, stable across picks. The
  // effective run is the explicit pick, else the pin.
  const packageOptions = createMemo(() =>
    instanceState.readyPackages.map((pkg) => ({
      value: pkg.id,
      label: pkg.label,
    })),
  );
  const effectiveRunId = () => exploreRunId() ?? instanceState.pinnedRunId;

  const scope = createMemo((): PackageScope | null => {
    const runId = effectiveRunId();
    return runId === null ? null : { runId, adminArea2: exploreAdminArea2() };
  });

  const [contextState, setContextState] = createSignal<
    StateHolder<RunAuthoringContext>
  >({ status: "loading" });

  let requestId = 0;

  createEffect(async () => {
    const runId = effectiveRunId();
    const thisRequest = ++requestId;
    if (runId === null) {
      setContextState({
        status: "error",
        err: t3({
          en: "No results package is available yet",
          fr: "Aucun paquet de résultats n'est encore disponible",
          pt: "Ainda não está disponível nenhum pacote de resultados",
        }),
      });
      return;
    }
    setContextState({ status: "loading" });
    const res = await getRunAuthoringContextFromCacheOrFetch(runId);
    if (thisRequest !== requestId) return;
    setContextState(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  });

  // The picker's own working state, so "Single, no area chosen yet" is a real
  // interim UI state. Only a COMPLETE selection reaches the ephemeral pair —
  // otherwise every gallery preview would refetch at national the moment the
  // user clicked the radio.
  const [scopeSelection, setScopeSelection] = createSignal<ScopeSelection>(
    scopeSelectionFromStored(exploreAdminArea2()),
  );

  function onScopeChange(sel: ScopeSelection) {
    setScopeSelection(sel);
    const stored = storedValueFromScopeSelection(sel);
    if (stored !== undefined) setExploreAdminArea2(stored);
  }

  return (
    <FigureEditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            data-tour="explore-header"
            heading={t3({ en: "Explore", fr: "Explorer", pt: "Explorar" })}
            searchText={searchText()}
            setSearchText={setSearchText}
            centerChildren={
              <Select
                data-tour="explore-package"
                value={effectiveRunId() ?? undefined}
                options={packageOptions()}
                onChange={setExploreRunId}
                placeholder={t3({
                  en: "Results package",
                  fr: "Paquet de résultats",
                  pt: "Pacote de resultados",
                })}
              />
            }
          >
            <Show when={!showAi()}>
              <Button
                onClick={() => setShowAi(true)}
                iconName="chevronLeft"
                outline
              >
                {t3({ en: "AI", fr: "IA", pt: "IA" })}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <StateHolderWrapper state={contextState()} noPad>
          {(context) => (
            <FrameLeftResizable
              startingWidth={260}
              minWidth={220}
              maxWidth={380}
              panelChildren={
                <div class="flex h-full w-full flex-col">
                  <div class="ui-pad border-b" data-tour="explore-scope">
                    <ScopePicker
                      selection={scopeSelection()}
                      onChange={onScopeChange}
                    />
                  </div>
                  <div
                    class="ui-pad flex-1 overflow-auto"
                    data-tour="explore-modules"
                  >
                    <ModuleSidebar
                      metricsByModule={groupMetricsByModule(
                        context.metrics,
                        context.modules,
                      )}
                      selectedModule={selectedModule()}
                      onSelectModule={(moduleId) => {
                        setSelectedModule(moduleId);
                        setSelectedMetricId("");
                        setSelectedPresetId("");
                      }}
                      totalMetricCount={
                        context.metrics.filter((m) => m.status === "ready")
                          .length
                      }
                    />
                  </div>
                </div>
              }
            >
              <Show
                when={scope()}
                fallback={
                  <EmptyState
                    iconName="package"
                    title={t3({
                      en: "No results package selected",
                      fr: "Aucun paquet de résultats sélectionné",
                      pt: "Nenhum pacote de resultados selecionado",
                    })}
                  />
                }
              >
                {(readyScope) => (
                  <ExploreBrowser
                    scope={readyScope()}
                    context={context}
                    searchText={searchText()}
                    selectedModule={selectedModule()}
                    selectedMetricId={selectedMetricId()}
                    onSelectMetric={(metricId) => {
                      setSelectedMetricId(metricId);
                      setSelectedPresetId("");
                    }}
                    selectedPresetId={selectedPresetId()}
                    onSelectPreset={setSelectedPresetId}
                    openFigureEditor={openFigureEditor}
                  />
                )}
              </Show>
            </FrameLeftResizable>
          )}
        </StateHolderWrapper>
      </FrameTop>
    </FigureEditorWrapper>
  );
}

type BrowserProps = {
  scope: PackageScope;
  context: RunAuthoringContext;
  searchText: string;
  selectedModule: ModuleId | "all";
  selectedMetricId: string;
  onSelectMetric: (metricId: string) => void;
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  openFigureEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

function ExploreBrowser(p: BrowserProps) {
  const metricGroups = createMemo((): MetricGroup[] => {
    const byModule = groupMetricsByModule(p.context.metrics, p.context.modules);
    const groups =
      p.selectedModule === "all"
        ? byModule.flatMap((m) => m.metricGroups)
        : (byModule.find((m) => m.moduleId === p.selectedModule)
            ?.metricGroups ?? []);
    if (p.searchText.length < 3) return groups;
    const searchLower = p.searchText.toLowerCase();
    return groups.filter((g) => g.label.toLowerCase().includes(searchLower));
  });

  const selectedMetric = createMemo((): MetricWithStatus | undefined =>
    p.context.metrics.find((m) => m.id === p.selectedMetricId),
  );

  // A preset is `{ metricId, config }` derived from the manifest — the gallery
  // for a metric is just its slice of the run's presets.
  const presetsForMetric = createMemo(() => {
    const metricId = p.selectedMetricId;
    return p.context.presets
      .filter((preset) => preset.metricId === metricId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  });

  const selectedConfig = createMemo((): PresentationObjectConfig | undefined =>
    presetsForMetric().find((preset) => preset.id === p.selectedPresetId)
      ?.config,
  );

  async function configureSelected(
    metric: MetricWithStatus,
    config: PresentationObjectConfig,
  ) {
    // Ephemeral by construction: the editor gets a COPY of the preset's config
    // and whatever it returns is dropped — Explore owns no rows (D6), and a
    // shared config object would let an exploratory edit rewrite the run's
    // preset for every other surface reading the same authoring context.
    await p.openFigureEditor({
      element: VisualizationEditor,
      props: {
        label: metric.label,
        scope: p.scope,
        metric,
        configSnapshot: structuredClone(unwrap(config)),
        authoringContext: p.context,
      },
    });
  }

  async function addSelectedToProduct(
    metric: MetricWithStatus,
    config: PresentationObjectConfig,
    caption: string,
  ) {
    await openComponent({
      element: AddToProductModal,
      props: { metric, config, caption },
    });
  }

  async function openCustomFigure(metric: MetricWithStatus) {
    const res = await openComponent({
      element: InsertFigureModal,
      props: {
        scope: p.scope,
        context: p.context,
        preselectedMetricId: metric.id,
      },
    });
    if (!res) return;
    await configureSelected(res.metric, res.config);
  }

  return (
    <Show
      when={selectedMetric()}
      fallback={
        <div
          class="ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] content-start items-start overflow-auto"
          data-tour="explore-metrics"
        >
          <For
            each={metricGroups()}
            fallback={
              <div class="text-base-content-muted text-sm">
                {t3({
                  en: "No metrics available",
                  fr: "Aucune métrique disponible",
                  pt: "Nenhuma métrica disponível",
                })}
              </div>
            }
          >
            {(group) => (
              <MetricCard
                metricGroup={group}
                selectedMetricId={p.selectedMetricId}
                onSelect={p.onSelectMetric}
              />
            )}
          </For>
        </div>
      }
    >
      {(metric) => (
        <FrameTop
          panelChildren={
            <HeadingBar
              onBack={() => p.onSelectMetric("")}
              heading={metric().label}
              subheading={metric().variantLabel ?? undefined}
            >
              <div class="ui-gap-sm flex items-center">
                <Button
                  outline
                  iconName="info"
                  onClick={() =>
                    void openComponent({
                      element: MetricDetailsModal,
                      props: { metric: metric() },
                    })
                  }
                >
                  {t3({
                    en: "Details",
                    fr: "Détails",
                    pt: "Detalhes",
                  })}
                </Button>
                <Button
                  outline
                  onClick={() => void openCustomFigure(metric())}
                >
                  {t3({
                    en: "Custom figure...",
                    fr: "Figure personnalisée...",
                    pt: "Figura personalizada...",
                  })}
                </Button>
                <Show when={selectedConfig()} keyed>
                  {(config) => (
                    <>
                      <Button
                        outline
                        iconName="pencil"
                        onClick={() =>
                          void configureSelected(metric(), config)
                        }
                      >
                        {t3({
                          en: "Configure",
                          fr: "Configurer",
                          pt: "Configurar",
                        })}
                      </Button>
                      <Button
                        iconName="plus"
                        onClick={() =>
                          void addSelectedToProduct(
                            metric(),
                            config,
                            metric().label,
                          )
                        }
                      >
                        {t3({
                          en: "Add to deck / report...",
                          fr: "Ajouter à une présentation / un rapport...",
                          pt: "Adicionar a apresentação / relatório...",
                        })}
                      </Button>
                    </>
                  )}
                </Show>
              </div>
            </HeadingBar>
          }
        >
          <div class="ui-pad ui-gap grid h-full w-full grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] content-start items-start overflow-auto">
            <For
              each={presetsForMetric()}
              fallback={
                <div class="text-base-content-muted text-sm">
                  {t3({
                    en: "This metric has no presets — use Custom figure to build one.",
                    fr: "Cette métrique n'a aucun préréglage — utilisez Figure personnalisée pour en créer une.",
                    pt: "Esta métrica não tem predefinições — utilize Figura personalizada para criar uma.",
                  })}
                </div>
              }
            >
              {(preset) => (
                <PresetPreview
                  scope={p.scope}
                  metric={metric()}
                  config={preset.config}
                  label={preset.label}
                  description={undefined}
                  selected={p.selectedPresetId === preset.id}
                  onClick={() => p.onSelectPreset(preset.id)}
                />
              )}
            </For>
          </div>
        </FrameTop>
      )}
    </Show>
  );
}
