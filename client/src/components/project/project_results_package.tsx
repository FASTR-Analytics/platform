import { t3, type RunListingItem, type RunProgress } from "lib";
import {
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  getEditorWrapper,
  type StateHolder,
} from "panther";
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
  ResultsPackageContents,
  ResultsPackageProvenanceLine,
} from "~/components/_shared/results_package/package_contents";
import { RunStatusBadge } from "~/components/_shared/results_package/status";
import { serverActions } from "~/server_actions";
import {
  addRScriptListener,
  addRunProgressListener,
} from "~/state/project/t1_sse";
import { instanceState } from "~/state/instance/t1_store";
import { projectState } from "~/state/project/t1_store";

// The project "Results package" surface (PLAN_RESULTS_RUNS item 2, narrowed
// by Phase 3 item 1): the package this project currently serves from, with
// live progress pushed over SSE while a generation it is a target of runs.
// Generation moved to the instance shell (a run belongs to no project), and
// item 4 turns this surface into the attach picker.
//
// What the package CONTAINS is rendered by the shared
// `_shared/results_package/` components — byte-identical to the instance
// catalogue, because the answer to "what is in this package" lives in the
// run directory and does not depend on who is asking. This surface only adds
// its own chrome: the "in use" marker, and (item 4) the picker.
export function ProjectResultsPackage() {
  const { openEditor, EditorWrapper } = getEditorWrapper();

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
  const [rLogs, setRLogs] = createStore<Record<string, string>>({});

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
      setRLogs(moduleId, text);
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
                        openEditor={openEditor}
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
  run: RunListingItem;
  liveProgress: RunProgress | undefined;
  rLogs: Record<string, string>;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const isAttached = () => projectState.attachedRunId === p.run.id;

  // Whether to offer the per-module viewers. The routes behind them are
  // instance-admin gated today, so offering the buttons to anyone else would
  // hand out a control that 403s. The permission model for package internals
  // is an open question (PLAN_RESULTS_RUNS item 3b) — this is the one
  // expression to change when it is settled.
  const canViewPackageInternals = () =>
    instanceState.currentUserIsGlobalAdmin ||
    instanceState.currentUserPermissions.can_configure_data;

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

      <ResultsPackageProvenanceLine run={p.run} showDiskSize={false} />

      <ResultsPackageContents
        run={p.run}
        liveProgress={p.liveProgress}
        latestRLine={(moduleId) => p.rLogs[moduleId]}
        canViewPackageInternals={canViewPackageInternals()}
        openEditor={p.openEditor}
      />
    </div>
  );
}
