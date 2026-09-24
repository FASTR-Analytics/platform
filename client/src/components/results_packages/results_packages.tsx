import { type RunCatalogItem, type RunProgress, t3 } from "lib";
import {
  Badge,
  Button,
  EmptyState,
  FrameTop,
  HeadingBar,
  openComponent,
  Table,
  type TableColumn,
} from "panther";
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import {
  PinnedBadge,
  RunStatusBadge,
  runStatusLabel,
} from "./package_view/mod.ts";
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

const _SEARCH_MIN_LENGTH = 3;

// The instance "Results packages" surface (PLAN_RESULTS_RUNS Phase 3 items 1
// and 3): generation is an instance-level act, so this is both where the
// launch wizard is entered (an ephemeral modal, nothing persisted before
// launch), and the catalogue of every package the instance holds, as a
// newest-first table with no selection state; a row's View button opens the
// package's own page through the shell wrapper. The listing is T1
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

  // Session-only: the list is short and a sticky filter is easy to forget.
  const [searchText, setSearchText] = createSignal("");

  const isSearching = () => searchText().length >= _SEARCH_MIN_LENGTH;

  const visibleRuns = createMemo((): RunCatalogItem[] => {
    const needle = searchText().toLowerCase();
    const searching = isSearching();
    return instanceState.runsCatalog.filter(
      (run) => !searching || run.label.toLowerCase().includes(needle),
    );
  });

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

  const columns = (): TableColumn<RunCatalogItem>[] => [
    {
      key: "label",
      header: t3({ en: "Package", fr: "Paquet", pt: "Pacote" }),
      sortable: true,
      render: (run) => run.label,
    },
    {
      key: "createdAt",
      header: t3({ en: "Created", fr: "Créé", pt: "Criado" }),
      sortable: true,
      render: (run) => new Date(run.createdAt).toLocaleString(),
    },
    {
      key: "createdBy",
      header: t3({ en: "Created by", fr: "Créé par", pt: "Criado por" }),
      sortable: true,
      render: (run) => run.createdBy ?? "",
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      filterable: true,
      filterValue: (run) => runStatusLabel(run.status),
      render: (run) => <RunStatusBadge status={run.status} />,
    },
    {
      key: "usage",
      header: t3({ en: "Usage", fr: "Utilisation", pt: "Utilização" }),
      sortable: true,
      sortValue: (run) => run.attachedProducts.length,
      filterable: true,
      filterValue: (run) =>
        run.attachedProducts.length > 0
          ? t3({ en: "In use", fr: "Utilisé", pt: "Em uso" })
          : t3({ en: "Unused", fr: "Non utilisé", pt: "Não utilizado" }),
      render: (run) => (
        <span class="ui-gap-sm inline-flex items-center">
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
        </span>
      ),
    },
    {
      key: "view",
      header: "",
      alignH: "right",
      width: "1%",
      render: (run) => (
        <Button
          data-tour="instance-results-packages-card"
          size="sm"
          ghost
          intent="base-content"
          iconName="chevronRight"
          iconPosition="right"
          onClick={() => openPackagePage(run.id)}
        >
          {t3({ en: "View", fr: "Voir", pt: "Ver" })}
        </Button>
      ),
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <div class="h-full w-full">
          <HeadingBar
            data-tour="instance-results-packages-header"
            compact
            searchText={searchText()}
            setSearchText={setSearchText}
            centerChildren={
              <Show when={isSearching()}>
                <span class="text-base-content-muted text-sm text-nowrap">
                  {t3({
                    en: `${visibleRuns().length} results`,
                    fr: `${visibleRuns().length} résultats`,
                    pt: `${visibleRuns().length} resultados`,
                  })}
                </span>
              </Show>
            }
          >
            <div class="ui-gap-sm flex items-center">
              <Button
                data-tour="instance-results-packages-defaults"
                size="sm"
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
                size="sm"
                onClick={openPrune}
                outline
                iconName="trash"
                disabled={instanceState.runsCatalog.length === 0}
              >
                {t3({ en: "Prune", fr: "Élaguer", pt: "Limpar" })}
              </Button>
              <Button
                data-tour="instance-results-packages-generate"
                size="sm"
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
        when={instanceState.runsCatalog.length > 0}
        fallback={<EmptyState iconName="package" title={emptyMessage()} />}
      >
        <div class="ui-pad h-full w-full">
          <Table
            data={visibleRuns()}
            columns={columns()}
            keyField="id"
            defaultSort={{ key: "createdAt", direction: "desc" }}
            noRowsMessage={noMatchMessage()}
            onRowClick={(run) => openPackagePage(run.id)}
          />
        </div>
      </Show>
    </FrameTop>
  );
}
