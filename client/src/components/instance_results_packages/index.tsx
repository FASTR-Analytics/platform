import {
  t3,
  TC,
  type RunCatalogItem,
  type RunGenerationAttemptDetail,
  type RunProgress,
} from "lib";
import {
  Button,
  FrameTop,
  StateHolderWrapper,
  createButtonAction,
  getEditorWrapper,
  openConfirm,
  type StateHolder,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { HeadingBarMainRibbon } from "~/components/_shared/heading_bar_main_ribbon";
import {
  ResultsPackageContents,
  ResultsPackageProvenanceLine,
} from "~/components/_shared/results_package/package_contents";
import { RunStatusBadge } from "~/components/_shared/results_package/status";
import { ResultsPackageWizard } from "~/components/results_package_wizard";
import { serverActions } from "~/server_actions";
import {
  addInstanceRScriptListener,
  addInstanceRunProgressListener,
} from "~/state/instance/t1_sse";

// The instance "Results packages" surface (PLAN_RESULTS_RUNS Phase 3 items 1
// and 3): generation is an instance-level act, so this is both where the
// launch wizard is entered — one in-flight configuration per admin,
// resumable — and the catalogue of every package the instance holds. A
// package attaches to projects at launch (the wizard's confirm step) or
// later from a project's Results package tab; this surface owns the debug
// viewers and the only act that ever reclaims a package's disk.
export function InstanceResultsPackages() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [attempt, setAttempt] = createSignal<RunGenerationAttemptDetail | null>(
    null,
  );
  const [runs, setRuns] = createSignal<StateHolder<RunCatalogItem[]>>({
    status: "loading",
  });
  const [version, setVersion] = createSignal(0);

  createEffect(async () => {
    version();
    const [attemptRes, runsRes] = await Promise.all([
      serverActions.getRunGenerationAttempt({}),
      serverActions.listRunCatalog({}),
    ]);
    if (attemptRes.success) {
      setAttempt(attemptRes.data);
    }
    setRuns(
      runsRes.success
        ? { status: "ready", data: runsRes.data }
        : { status: "error", err: runsRes.err },
    );
  });

  async function refreshAll(): Promise<void> {
    setVersion((v) => v + 1);
  }

  async function openWizard(): Promise<void> {
    await openEditor({
      element: ResultsPackageWizard,
      props: { silentFetch: refreshAll },
    });
    await refreshAll();
  }

  const startConfiguration = createButtonAction(
    () => serverActions.createRunGenerationAttempt({}),
    refreshAll,
    openWizard,
  );

  // Live generation state over instance SSE (Q-B ruling (a) and (e)):
  // progress patches the row in place and the R line is keyed by RUN as well
  // as module, so two concurrent generations never overwrite each other's
  // line. The listing itself refetches when a run this list has never seen
  // appears (another admin launched it) and at the boundaries of a
  // generation — currentModuleId is null before the first module and after
  // the last, which is exactly when status, summary and disk size change.
  const [liveProgress, setLiveProgress] = createSignal<
    Record<string, RunProgress>
  >({});
  const [rLogs, setRLogs] = createStore<Record<string, string>>({});

  onMount(() => {
    const unsubProgress = addInstanceRunProgressListener((runId, progress) => {
      setLiveProgress((prev) => ({ ...prev, [runId]: progress }));
      const current = runs();
      const isUnknownRun = current.status === "ready" &&
        !current.data.some((r) => r.id === runId);
      if (isUnknownRun || progress.currentModuleId === null) {
        setVersion((v) => v + 1);
      }
    });
    const unsubRScript = addInstanceRScriptListener((runId, moduleId, text) => {
      setRLogs(`${runId}|${moduleId}`, text);
    });
    onCleanup(() => {
      unsubProgress();
      unsubRScript();
    });
  });

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBarMainRibbon
            heading={t3({
              en: "Results packages",
              fr: "Paquets de résultats",
              pt: "Pacotes de resultados",
            })}
          >
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
              <Match when={true}>
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
          </HeadingBarMainRibbon>
        }
      >
        <div class="ui-pad ui-spy">
          <div class="text-base-content-muted max-w-2xl">
            {t3({
              en: "A results package is generated once for the whole instance from the data and modules you choose, then attached to the projects that should use it.",
              fr: "Un paquet de résultats est généré une fois pour toute l'instance à partir des données et des modules que vous choisissez, puis rattaché aux projets qui doivent l'utiliser.",
              pt: "Um pacote de resultados é gerado uma vez para toda a instância a partir dos dados e módulos que escolher, e depois é anexado aos projetos que o devem usar.",
            })}
          </div>
          <StateHolderWrapper state={runs()} noPad>
            {(keyedRuns) => (
              <div class="ui-spy">
                <Show
                  when={keyedRuns.length > 0}
                  fallback={
                    <div class="text-base-content-muted">
                      {t3({
                        en: "No results packages yet.",
                        fr: "Aucun paquet de résultats pour l'instant.",
                        pt: "Ainda não existem pacotes de resultados.",
                      })}
                    </div>
                  }
                >
                  <For each={keyedRuns}>
                    {(run) => (
                      <RunCard
                        run={run}
                        liveProgress={liveProgress()[run.id]}
                        rLogs={rLogs}
                        openEditor={openEditor}
                        refreshAll={refreshAll}
                      />
                    )}
                  </For>
                </Show>
              </div>
            )}
          </StateHolderWrapper>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

function RunCard(p: {
  run: RunCatalogItem;
  liveProgress: RunProgress | undefined;
  rLogs: Record<string, string>;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
  refreshAll: () => Promise<void>;
}) {
  // Guarded hard delete (fork ruling 3): ONE act — catalog row, files and
  // cached results — with no archived state and no automatic GC. The server
  // refuses while a project points at the package or it is still
  // generating; the button states the reason rather than disappearing, so
  // an undeletable package is never a mystery.
  const deleteBlockedReason = (): string | null => {
    if (p.run.status === "generating") {
      return t3({
        en: "Cannot delete while generating",
        fr: "Suppression impossible pendant la génération",
        pt: "Não é possível eliminar durante a geração",
      });
    }
    if (p.run.attachedProjects.length > 0) {
      return t3({
        en: "Cannot delete while in use",
        fr: "Suppression impossible tant qu'il est utilisé",
        pt: "Não é possível eliminar enquanto estiver em uso",
      });
    }
    return null;
  };

  const deletePackage = createButtonAction(
    async () => {
      const confirmed = await openConfirm({
        title: t3({
          en: "Delete this results package?",
          fr: "Supprimer ce paquet de résultats ?",
          pt: "Eliminar este pacote de resultados?",
        }),
        text: t3({
          en: "Its files and cached results are permanently removed. This cannot be undone.",
          fr: "Ses fichiers et ses résultats mis en cache sont définitivement supprimés. Cette action est irréversible.",
          pt: "Os seus ficheiros e resultados em cache são removidos permanentemente. Esta ação não pode ser anulada.",
        }),
        intent: "danger",
        confirmButtonLabel: t3(TC.delete),
      });
      if (!confirmed) {
        return { success: true as const };
      }
      return await serverActions.deleteRun({ run_id: p.run.id });
    },
    () => p.refreshAll(),
  );

  return (
    <div class="ui-pad ui-spy-sm rounded border">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <RunStatusBadge status={p.run.status} />
        <Show
          when={deleteBlockedReason()}
          fallback={
            <Button
              size="sm"
              intent="danger"
              outline
              iconName="trash"
              onClick={deletePackage.click}
              state={deletePackage.state()}
            >
              {t3(TC.delete)}
            </Button>
          }
          keyed
        >
          {(reason) => (
            <div class="text-base-content-muted text-xs">{reason}</div>
          )}
        </Show>
      </div>

      <ResultsPackageProvenanceLine run={p.run} showDiskSize />

      <div class="text-base-content-muted text-xs">
        <Show
          when={p.run.attachedProjects.length > 0}
          fallback={t3({
            en: "Not attached to any project",
            fr: "Rattaché à aucun projet",
            pt: "Não anexado a nenhum projeto",
          })}
        >
          {`${t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}: ${
            p.run.attachedProjects.map((project) => project.label).join(", ")
          }`}
        </Show>
      </div>

      <ResultsPackageContents
        run={p.run}
        liveProgress={p.liveProgress}
        latestRLine={(moduleId) => p.rLogs[`${p.run.id}|${moduleId}`]}
        canViewPackageInternals
        openEditor={p.openEditor}
      />
    </div>
  );
}
