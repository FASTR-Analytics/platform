import { type RunCatalogItem, type RunProgress, t3 } from "lib";
import {
  Badge,
  Button,
  EmptyState,
  FrameTop,
  HeadingBar,
  Icon,
  openComponent,
  Select,
} from "panther";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import { PinnedBadge, RunStatusBadge } from "./package_view/mod.ts";
import { PruneResultsPackages } from "./prune";
import { ResultsPackageWizard } from "./wizard/mod.ts";
import { ResultsPackagePage } from "./package_page";
import { ModuleDefaultsEditor } from "./module_defaults";
import {
  addInstanceRScriptListener,
  addInstanceRunProgressListener,
} from "~/state/instance/t1_sse";
import { instanceState } from "~/state/instance/t1_store";
import { openShellEditor } from "~/state/t4_ui";

type UsageFilter = "all" | "in_use" | "unused";

const _SEARCH_MIN_LENGTH = 3;

// The instance "Results packages" surface (PLAN_RESULTS_RUNS Phase 3 items 1
// and 3): generation is an instance-level act, so this is both where the
// launch wizard is entered (an ephemeral modal, nothing persisted before
// launch), and the catalogue of every package the instance holds, as a plain
// newest-first list with no selection state; a row opens the package's own
// page through the shell wrapper. The listing is T1
// (`instanceState.runsCatalog`, pushed on every catalogue mutation), so this
// surface has no component fetch of its own. Products point at a package from
// product settings. This surface owns the only act that ever reclaims a
// package's disk.
export function InstanceResultsPackages() {
  // Live generation state over instance SSE (Q-B ruling (a) and (e)):
  // progress patches the page in place and the R line is keyed by RUN as
  // well as module, so two concurrent generations never overwrite each
  // other's line. The listeners live here, which stays mounted under the
  // open package page; the page reads them through accessors. The listing
  // itself is T1: every catalogue mutation signals runs_catalog_updated and
  // the SSE boundary refetches the store, so this page never fetches the
  // listing.
  const [liveProgress, setLiveProgress] = createSignal<
    Record<string, RunProgress>
  >({});
  const [rLogs, setRLogs] = createStore<Record<string, string>>({});

  onMount(() => {
    const unsubProgress = addInstanceRunProgressListener((runId, progress) => {
      setLiveProgress((prev) => ({ ...prev, [runId]: progress }));
    });
    const unsubRScript = addInstanceRScriptListener((runId, moduleId, text) => {
      setRLogs(`${runId}|${moduleId}`, text);
    });
    onCleanup(() => {
      unsubProgress();
      unsubRScript();
    });
  });

  function openPackagePage(runId: string): void {
    void openShellEditor({
      element: ResultsPackagePage,
      props: {
        runId,
        liveProgress: () => liveProgress()[runId],
        latestRLine: (moduleId: string) => rLogs[`${runId}|${moduleId}`],
      },
    });
  }

  // A launched run is opened before it reaches the listing: the SSE refetch
  // lands it moments later and the page is already waiting for it.
  async function openWizard(): Promise<void> {
    const launchedRunId = await openComponent({
      element: ResultsPackageWizard,
      props: {},
    });
    if (launchedRunId !== undefined) {
      openPackagePage(launchedRunId);
    }
  }

  // Prune needs nothing back: the list shrinks over SSE.
  async function openPrune(): Promise<void> {
    await openComponent({ element: PruneResultsPackages, props: {} });
  }

  async function openModuleDefaults(): Promise<void> {
    await openShellEditor({
      element: ModuleDefaultsEditor,
      props: {},
    });
  }

  const sortedRuns = createMemo((): RunCatalogItem[] =>
    [...instanceState.runsCatalog].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  );

  // Session-only: the list is short and a sticky filter is easy to forget.
  const [searchText, setSearchText] = createSignal("");
  const [usageFilter, setUsageFilter] = createSignal<UsageFilter>("all");

  const isSearching = () => searchText().length >= _SEARCH_MIN_LENGTH;

  const visibleRuns = createMemo((): RunCatalogItem[] => {
    const needle = searchText().toLowerCase();
    const searching = isSearching();
    const usage = usageFilter();
    return sortedRuns().filter((run) => {
      const inUse = run.attachedProducts.length > 0;
      return (
        (usage === "all" || inUse === (usage === "in_use")) &&
        (!searching || run.label.toLowerCase().includes(needle))
      );
    });
  });

  const usageOptions = (): { value: UsageFilter; label: string }[] => [
    { value: "all", label: t3({ en: "All", fr: "Tous", pt: "Todos" }) },
    {
      value: "in_use",
      label: t3({ en: "In use", fr: "Utilisé", pt: "Em uso" }),
    },
    {
      value: "unused",
      label: t3({ en: "Unused", fr: "Non utilisé", pt: "Não utilizado" }),
    },
  ];

  const emptyMessage = () =>
    t3({
      en: "No results packages yet.",
      fr: "Aucun paquet de résultats pour l'instant.",
      pt: "Ainda não existem pacotes de resultados.",
    });

  const noMatchMessage = () =>
    t3({
      en: "No results packages match.",
      fr: "Aucun paquet de résultats ne correspond.",
      pt: "Nenhum pacote de resultados corresponde.",
    });

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full">
          <HeadingBar
            data-tour="instance-results-packages-header"
            heading={t3({
              en: "Results packages",
              fr: "Paquets de résultats",
              pt: "Pacotes de resultados",
            })}
            subheading={
              isSearching()
                ? t3({
                    en: `${visibleRuns().length} results`,
                    fr: `${visibleRuns().length} résultats`,
                    pt: `${visibleRuns().length} resultados`,
                  })
                : undefined
            }
            searchText={searchText()}
            setSearchText={setSearchText}
            centerChildren={
              <div class="w-36">
                <Select
                  data-tour="instance-results-packages-usage-filter"
                  value={usageFilter()}
                  onChange={setUsageFilter}
                  options={usageOptions()}
                  fullWidth
                />
              </div>
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Button
                data-tour="instance-results-packages-defaults"
                onClick={openModuleDefaults}
                outline
                iconName="settings"
              >
                {t3({
                  en: "Module defaults",
                  fr: "Paramètres par défaut des modules",
                  pt: "Predefinições dos módulos",
                })}
              </Button>
              <Button
                data-tour="instance-results-packages-prune"
                onClick={openPrune}
                outline
                iconName="trash"
                disabled={instanceState.runsCatalog.length === 0}
              >
                {t3({ en: "Prune", fr: "Élaguer", pt: "Limpar" })}
              </Button>
              <Button
                data-tour="instance-results-packages-generate"
                onClick={openWizard}
                iconName="package"
              >
                {t3({
                  en: "Generate new results package",
                  fr: "Générer un nouveau paquet de résultats",
                  pt: "Gerar novo pacote de resultados",
                })}
              </Button>
            </div>
          </HeadingBar>
        </div>
      }
    >
      <Show
        when={sortedRuns().length > 0}
        fallback={<EmptyState iconName="package" title={emptyMessage()} />}
      >
        <Show
          when={visibleRuns().length > 0}
          fallback={<EmptyState iconName="search" title={noMatchMessage()} />}
        >
          <div class="ui-pad ui-spy-sm h-full overflow-y-auto">
            <For each={visibleRuns()}>
              {(run) => (
                <div
                  class="ui-hoverable-base-100 ui-gap flex cursor-pointer items-center rounded border px-3 py-2"
                  onClick={() => openPackagePage(run.id)}
                >
                  <div class="min-w-0 flex-1">
                    <div class="font-700 truncate">{run.label}</div>
                    <div class="ui-text-caption">
                      {new Date(run.createdAt).toLocaleString()}
                      {run.createdBy !== null ? ` · ${run.createdBy}` : ""}
                    </div>
                  </div>
                  <Show when={run.status === "failed"}>
                    <Badge intent="danger" variant="solid">
                      <Icon iconName="alertCircle" />
                    </Badge>
                  </Show>
                  <Show when={run.id === instanceState.pinnedRunId}>
                    <PinnedBadge />
                  </Show>
                  <Show when={run.attachedProducts.length > 0}>
                    <Badge>
                      {t3({
                        en: `In use by ${run.attachedProducts.length}`,
                        fr: `Utilisé par ${run.attachedProducts.length}`,
                        pt: `Em uso por ${run.attachedProducts.length}`,
                      })}
                    </Badge>
                  </Show>
                  <RunStatusBadge status={run.status} />
                  <Icon iconName="chevronRight" />
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </FrameTop>
  );
}
