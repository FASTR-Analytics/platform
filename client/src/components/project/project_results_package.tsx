import { t3, type RunListingItem, type RunProgress } from "lib";
import { FrameTop, HeadingBar, StateHolderWrapper, type StateHolder } from "panther";
import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import {
  ModuleProgressChip,
  RunStatusBadge,
  moduleLabel,
} from "~/components/_shared/results_package_status";
import { serverActions } from "~/server_actions";
import {
  addRScriptListener,
  addRunProgressListener,
} from "~/state/project/t1_sse";
import { projectState } from "~/state/project/t1_store";

// The project "Results package" surface (PLAN_RESULTS_RUNS item 2, narrowed
// by Phase 3 items 1 and 3): the package this project currently serves from,
// with live progress pushed over SSE while a generation it is a target of
// runs. Generation moved to the instance shell (a run belongs to no
// project), the per-module script/log/file viewers moved to the instance
// catalogue with it (Q-F — debug surfaces are admin-shaped), and item 4
// turns this surface into the attach picker.
export function ProjectResultsPackage() {
  const [runs, setRuns] = createSignal<StateHolder<RunListingItem[]>>({
    status: "loading",
  });
  const [version, setVersion] = createSignal(0);

  // Stale-while-revalidate: refetches on version bump and on attachedRunId
  // change (a publish repoints the project, which is how a generating run
  // turns ready).
  createEffect(async () => {
    version();
    const _attachedRunId = projectState.attachedRunId;
    const projectId = projectState.id;
    const runsRes = await serverActions.listRunsForProject({
      project_id: projectId,
    });
    setRuns(
      runsRes.success
        ? { status: "ready", data: runsRes.data }
        : { status: "error", err: runsRes.err },
    );
  });

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

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({
            en: "Results package",
            fr: "Paquet de résultats",
            pt: "Pacote de resultados",
          })}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <StateHolderWrapper state={runs()} noPad>
          {(keyedRuns) => (
            <div class="ui-spy">
              <Show
                when={keyedRuns.length > 0}
                fallback={
                  <div class="text-base-content-muted">
                    {t3({
                      en: "This project has no results package attached yet. An instance administrator generates one on the Results packages page.",
                      fr: "Aucun paquet de résultats n'est encore rattaché à ce projet. Un administrateur de l'instance en génère un sur la page Paquets de résultats.",
                      pt: "Este projeto ainda não tem nenhum pacote de resultados anexado. Um administrador da instância gera um na página Pacotes de resultados.",
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
  );
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
      classList={{ "border-primary": isAttached() }}
    >
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <Show when={isAttached()}>
          <div class="bg-primary text-primary-content rounded px-2 py-0.5 text-xs">
            {t3({
              en: "In use",
              fr: "En cours d'utilisation",
              pt: "Em utilização",
            })}
          </div>
        </Show>
        <RunStatusBadge status={p.run.status} />
      </div>
      <div class="text-base-content-muted text-xs">
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
          <div class="ui-spy-sm">
            <div class="text-base-content-muted text-sm">
              {summary.moduleIds.length}{" "}
              {t3({ en: "modules", fr: "modules", pt: "módulos" })} ·{" "}
              {summary.metricCount}{" "}
              {t3({ en: "metrics", fr: "métriques", pt: "métricas" })}
            </div>
            <For each={summary.moduleIds}>
              {(moduleId) => (
                <div class="text-sm">{moduleLabel(moduleId)}</div>
              )}
            </For>
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
                <div class="text-base-content-muted truncate font-mono text-xs">
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
