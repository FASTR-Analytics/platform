import {
  MODULE_REGISTRY,
  t3,
  type RunGenerationAttemptDetail,
  type RunListingItem,
  type RunModuleProgressStatus,
  type RunProgress,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  getEditorWrapper,
  createButtonAction,
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
import { ResultsPackageWizard } from "~/components/results_package_wizard";
import { serverActions } from "~/server_actions";
import {
  addRScriptListener,
  addRunProgressListener,
} from "~/state/project/t1_sse";
import { projectState } from "~/state/project/t1_store";

// The project "Results package" surface (PLAN_RESULTS_RUNS item 2): the
// attached package, this project's runs (generating/ready/failed) with live
// progress pushed over SSE, and the generate/resume entry into the launch
// wizard. Instance-admin surface for now (generation gating) — the Phase-3
// instance-catalogue precursor.
export function ProjectResultsPackage() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [runs, setRuns] = createSignal<StateHolder<RunListingItem[]>>({
    status: "loading",
  });
  const [attempt, setAttempt] = createSignal<RunGenerationAttemptDetail | null>(
    null,
  );
  const [version, setVersion] = createSignal(0);

  // Stale-while-revalidate: refetches on version bump and on attachedRunId
  // change (a publish repoints the project, which is how a generating run
  // turns ready).
  createEffect(async () => {
    version();
    const _attachedRunId = projectState.attachedRunId;
    const projectId = projectState.id;
    const [runsRes, attemptRes] = await Promise.all([
      serverActions.listRunsForProject({ project_id: projectId }),
      serverActions.getRunGenerationAttempt({ project_id: projectId }),
    ]);
    setRuns(
      runsRes.success
        ? { status: "ready", data: runsRes.data }
        : { status: "error", err: runsRes.err },
    );
    if (attemptRes.success) {
      setAttempt(attemptRes.data);
    }
  });

  async function refreshAll(): Promise<void> {
    setVersion((v) => v + 1);
  }

  // Live generation state: run_progress patches the row in place; a runId
  // this list has never seen (launched elsewhere) or a failure (status
  // flipped server-side) triggers a refetch.
  const [liveProgress, setLiveProgress] = createSignal<
    Record<string, RunProgress>
  >({});
  const [rLogs, setRLogs] = createStore<Record<string, { latest: string }>>({});

  onMount(() => {
    const unsubProgress = addRunProgressListener((runId, progress) => {
      setLiveProgress((prev) => ({ ...prev, [runId]: progress }));
      const currentRuns = runs();
      const isUnknownRun = currentRuns.status === "ready" &&
        !currentRuns.data.some((r) => r.id === runId);
      if (isUnknownRun || progress.errorDetail !== null) {
        setVersion((v) => v + 1);
      }
    });
    const unsubRScript = addRScriptListener((moduleId, text) => {
      setRLogs(moduleId, { latest: text });
    });
    onCleanup(() => {
      unsubProgress();
      unsubRScript();
    });
  });

  const anyGenerating = () => {
    const state = runs();
    return state.status === "ready" &&
      state.data.some((r) => r.status === "generating");
  };

  async function openWizard(): Promise<void> {
    await openEditor({
      element: ResultsPackageWizard,
      props: {
        projectId: projectState.id,
        silentFetch: refreshAll,
      },
    });
    await refreshAll();
  }

  const startConfiguration = createButtonAction(
    () =>
      serverActions.createRunGenerationAttempt({
        project_id: projectState.id,
      }),
    refreshAll,
    openWizard,
  );

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={t3({
              en: "Results package",
              fr: "Paquet de résultats",
              pt: "Pacote de resultados",
            })}
          >
            <div class="ui-gap-sm flex">
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
                    disabled={anyGenerating()}
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
        <div class="ui-pad ui-spy">
          <Show when={anyGenerating()}>
            <div class="text-neutral text-sm">
              {t3({
                en: "A results package is currently being generated for this project.",
                fr: "Un paquet de résultats est en cours de génération pour ce projet.",
                pt: "Um pacote de resultados está a ser gerado para este projeto.",
              })}
            </div>
          </Show>
          <StateHolderWrapper state={runs()} noPad>
            {(keyedRuns) => (
              <div class="ui-spy">
                <Show
                  when={keyedRuns.length > 0}
                  fallback={
                    <div class="text-neutral">
                      {t3({
                        en: "No results packages have been generated for this project yet.",
                        fr: "Aucun paquet de résultats n'a encore été généré pour ce projet.",
                        pt: "Ainda não foi gerado nenhum pacote de resultados para este projeto.",
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

function moduleLabel(moduleId: string): string {
  const entry = MODULE_REGISTRY.find((m) => m.id === moduleId);
  return entry === undefined ? moduleId : t3(entry.label);
}

function RunCard(p: {
  run: RunListingItem;
  liveProgress: RunProgress | undefined;
  rLogs: Record<string, { latest: string }>;
}) {
  const progress = () => p.liveProgress ?? p.run.progress;
  const isAttached = () => projectState.attachedRunId === p.run.id;

  return (
    <div
      class="ui-pad ui-spy-sm rounded border"
      classList={{
        "border-primary": isAttached(),
        "border-base-300": !isAttached(),
      }}
    >
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <Show when={isAttached()}>
          <div class="bg-primary text-primary-content rounded px-2 py-0.5 text-xs">
            {t3({ en: "In use", fr: "En cours d'utilisation", pt: "Em utilização" })}
          </div>
        </Show>
        <RunStatusBadge status={p.run.status} />
      </div>
      <div class="text-neutral text-xs">
        {new Date(p.run.createdAt).toLocaleString()}
        {p.run.createdBy !== null ? ` · ${p.run.createdBy}` : ""}
        {p.run.provenance === "synthetic-backfill"
          ? ` · ${t3({
            en: "created from existing project results",
            fr: "créé à partir des résultats existants du projet",
            pt: "criado a partir dos resultados existentes do projeto",
          })}`
          : ""}
      </div>

      <Show when={p.run.status === "ready" && p.run.summary} keyed>
        {(summary) => (
          <div class="text-neutral text-sm">
            {summary.moduleIds.length}{" "}
            {t3({ en: "modules", fr: "modules", pt: "módulos" })} ·{" "}
            {summary.metricCount}{" "}
            {t3({ en: "metrics", fr: "métriques", pt: "métricas" })}
          </div>
        )}
      </Show>

      <Show when={p.run.status === "generating" && progress()} keyed>
        {(keyedProgress) => (
          <div class="ui-spy-sm">
            <div class="ui-gap-sm flex flex-wrap">
              <For each={keyedProgress.moduleOrder}>
                {(moduleId) => (
                  <ModuleProgressChip
                    label={moduleLabel(moduleId)}
                    status={keyedProgress.moduleStatus[moduleId] ?? "pending"}
                  />
                )}
              </For>
            </div>
            <Show when={keyedProgress.currentModuleId} keyed>
              {(currentModuleId) => (
                <div class="text-neutral truncate font-mono text-xs">
                  {p.rLogs[currentModuleId]?.latest ?? "..."}
                </div>
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={p.run.status === "failed"}>
        <div class="text-danger text-sm">
          {progress()?.errorDetail ??
            t3({
              en: "Generation failed",
              fr: "Échec de la génération",
              pt: "Falha na geração",
            })}
        </div>
      </Show>
    </div>
  );
}

function RunStatusBadge(p: { status: RunListingItem["status"] }) {
  return (
    <Switch>
      <Match when={p.status === "generating"}>
        <div class="bg-neutral text-neutral-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Generating", fr: "En cours de génération", pt: "A gerar" })}
        </div>
      </Match>
      <Match when={p.status === "ready"}>
        <div class="bg-success text-success-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Ready", fr: "Prêt", pt: "Pronto" })}
        </div>
      </Match>
      <Match when={p.status === "failed"}>
        <div class="bg-danger text-danger-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Failed", fr: "Échoué", pt: "Falhou" })}
        </div>
      </Match>
      <Match when={p.status === "retired"}>
        <div class="bg-neutral text-neutral-content rounded px-2 py-0.5 text-xs">
          {t3({ en: "Retired", fr: "Retiré", pt: "Retirado" })}
        </div>
      </Match>
    </Switch>
  );
}

function ModuleProgressChip(p: {
  label: string;
  status: RunModuleProgressStatus;
}) {
  return (
    <div
      class="rounded border px-2 py-0.5 text-xs"
      classList={{
        "border-base-300 text-neutral": p.status === "pending",
        "border-primary text-primary": p.status === "running",
        "border-success text-success":
          p.status === "done" || p.status === "reused",
        "border-danger text-danger": p.status === "error",
      }}
    >
      {p.label}
      <Show when={p.status === "running"}>
        {" "}
        <span class="animate-pulse">●</span>
      </Show>
      <Show when={p.status === "reused"}>
        {" "}
        ({t3({ en: "reused", fr: "réutilisé", pt: "reutilizado" })})
      </Show>
    </div>
  );
}
