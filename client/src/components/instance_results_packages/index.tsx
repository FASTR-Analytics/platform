import {
  t3,
  type RunCatalogItem,
  type RunGenerationAttemptDetail,
  type RunProgress,
} from "lib";
import {
  Badge,
  Button,
  EmptyState,
  FrameLeftResizable,
  FrameTop,
  HeadingBar,
  SelectList,
  createButtonAction,
  getEditorWrapper,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { PinnedBadge } from "~/components/_shared/results_package/status";
import { ResultsPackageWizard } from "~/components/results_package_wizard";
import { RunCatalogDetailPane } from "./detail";
import { ModuleDefaultsEditor } from "./module_defaults";
import { serverActions } from "~/server_actions";
import {
  addInstanceRScriptListener,
  addInstanceRunProgressListener,
} from "~/state/instance/t1_sse";
import { instanceState } from "~/state/instance/t1_store";

// The instance "Results packages" surface (PLAN_RESULTS_RUNS Phase 3 items 1
// and 3): generation is an instance-level act, so this is both where the
// launch wizard is entered — one in-flight configuration per admin,
// resumable — and the catalogue of every package the instance holds, as a
// master–detail (sidebar list + detail pane). The listing is T1
// (`instanceState.runsCatalog`, pushed on every catalogue mutation); the only
// component fetch left is the per-admin wizard attempt (T3, per-user, not
// broadcastable). A package attaches to projects at launch (the wizard's
// confirm step) or later from a project's Results package tab. This surface
// owns the only act that ever reclaims a package's disk.
export function InstanceResultsPackages() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [attempt, setAttempt] = createSignal<RunGenerationAttemptDetail | null>(
    null,
  );

  async function refreshAll(): Promise<void> {
    const res = await serverActions.getRunGenerationAttempt({});
    if (res.success) {
      setAttempt(res.data);
    }
  }

  async function openWizard(): Promise<void> {
    await openEditor({
      element: ResultsPackageWizard,
      props: { silentFetch: refreshAll },
    });
    await refreshAll();
  }

  async function openModuleDefaults(): Promise<void> {
    await openEditor({
      element: ModuleDefaultsEditor,
      props: {},
    });
  }

  const startConfiguration = createButtonAction(
    () => serverActions.createRunGenerationAttempt({}),
    refreshAll,
    openWizard,
  );

  // Live generation state over instance SSE (Q-B ruling (a) and (e)):
  // progress patches the pane in place and the R line is keyed by RUN as
  // well as module, so two concurrent generations never overwrite each
  // other's line. The listing itself is T1 — every catalogue mutation
  // signals runs_catalog_updated and the SSE boundary refetches the store,
  // so this page never fetches the listing.
  const [liveProgress, setLiveProgress] = createSignal<
    Record<string, RunProgress>
  >({});
  const [rLogs, setRLogs] = createStore<Record<string, string>>({});

  onMount(() => {
    void refreshAll();
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

  const sortedRuns = createMemo((): RunCatalogItem[] =>
    [...instanceState.runsCatalog].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
  );

  // Selection is T5 and never jumps (ruling 4, amended): the effect PINS the
  // newest run's id whenever nothing is pinned — first non-empty render, and
  // after the selected run is deleted (falling to newest was the ruled
  // behavior there). Without the pin, the derived fallback re-resolved to
  // another admin's freshly launched run and the keyed <Show> remounted the
  // pane mid-read. The `?? sortedRuns()[0]` fallback stays as the same-tick
  // bridge until the effect runs.
  const [selectedId, setSelectedId] = createSignal<string | undefined>(
    undefined,
  );
  createEffect(() => {
    const first = sortedRuns()[0];
    if (selectedId() === undefined && first !== undefined) {
      setSelectedId(first.id);
    }
  });
  const selectedRun = (): RunCatalogItem | undefined =>
    instanceState.runsCatalog.find((r) => r.id === selectedId()) ??
    sortedRuns()[0];

  // "Latest" is DERIVED — the newest ready package — never stored and never a
  // consumer-facing pointer (SYSTEM_08 "Latest is derived, pinned is
  // stored"). The stored, explicit concept is the pin, read from the one
  // instance T1 field every surface uses (`instanceState.pinnedRunId`).
  const latestReadyId = createMemo(
    (): string | undefined => sortedRuns().find((r) => r.status === "ready")?.id,
  );

  const emptyMessage = () =>
    t3({
      en: "No results packages yet.",
      fr: "Aucun paquet de résultats pour l'instant.",
      pt: "Ainda não existem pacotes de resultados.",
    });

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            heading={t3({
              en: "Results packages",
              fr: "Paquets de résultats",
              pt: "Pacotes de resultados",
            })}
          >
            <div class="ui-gap-sm flex items-center">
              <Button
                onClick={openModuleDefaults}
                outline
                onBackground="base-200"
                iconName="settings"
              >
                {t3({
                  en: "Module defaults",
                  fr: "Paramètres par défaut des modules",
                  pt: "Predefinições dos módulos",
                })}
              </Button>
              <Switch>
                <Match when={attempt() !== null}>
                  <Button onClick={openWizard} iconName="pencil">
                    {t3({
                      en: "Resume configuration",
                      fr: "Reprendre la configuration",
                      pt: "Retomar a configuração",
                    })}
                  </Button>
                </Match>
                <Match when={attempt() === null}>
                  <Button
                    onClick={startConfiguration.click}
                    state={startConfiguration.state()}
                    iconName="package"
                  >
                    {t3({
                      en: "Generate new results package",
                      fr: "Générer un nouveau paquet de résultats",
                      pt: "Gerar novo pacote de resultados",
                    })}
                  </Button>
                </Match>
              </Switch>
            </div>
          </HeadingBar>
        }
      >
        <FrameLeftResizable
          startingWidth={300}
          minWidth={150}
          maxWidth={400}
          panelChildren={
            <div class="ui-pad h-full overflow-auto">
              <SelectList<string, RunCatalogItem>
                items={sortedRuns().map((r) => ({
                  id: r.id,
                  label: r.label,
                  meta: r,
                }))}
                value={selectedRun()?.id}
                onChange={setSelectedId}
                fullWidth
                emptyMessage={emptyMessage()}
                renderItem={(item) => (
                  <Show when={item.meta} keyed fallback={item.label}>
                    {(run) => (
                      <div>
                        <div class="ui-gap-sm flex items-center">
                          <div class="flex-1 truncate">{run.label}</div>
                          <Show when={run.id === instanceState.pinnedRunId}>
                            <PinnedBadge />
                          </Show>
                          <Show when={run.id === latestReadyId()}>
                            <Badge intent="neutral">
                              {t3({ en: "Latest", fr: "Dernier", pt: "Mais recente" })}
                            </Badge>
                          </Show>
                        </div>
                        <div class="ui-text-caption">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </Show>
                )}
              />
            </div>
          }
        >
          <Show
            when={selectedRun()}
            keyed
            fallback={<EmptyState iconName="package" title={emptyMessage()} />}
          >
            {(run) => (
              <RunCatalogDetailPane
                run={run}
                liveProgress={liveProgress()[run.id]}
                latestRLine={(moduleId) => rLogs[`${run.id}|${moduleId}`]}
                openEditor={openEditor}
              />
            )}
          </Show>
        </FrameLeftResizable>
      </FrameTop>
    </EditorWrapper>
  );
}
