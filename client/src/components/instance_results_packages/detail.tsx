import {
  getValidatedModuleId,
  t3,
  TC,
  type PinResultsPackageResult,
  type RunCatalogItem,
  type RunProgress,
} from "lib";
import {
  Button,
  Callout,
  createButtonAction,
  createDeleteAction,
  getEditorWrapper,
  openAlert,
  openConfirm,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import {
  FailedErrorDetail,
  ResultsPackageProvenanceLine,
  ResultsPackageView,
} from "~/components/_shared/results_package/package_view";
import {
  ModuleProgressChip,
  PinnedBadge,
  RunStatusBadge,
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
} from "~/components/_shared/results_package/status";
import { ViewFiles } from "~/components/_shared/results_package/view_files";
import { ViewLogs } from "~/components/_shared/results_package/view_logs";
import { ViewScript } from "~/components/_shared/results_package/view_script";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;
type OpenViewer = (element: Viewer, moduleId: string) => void;

// The catalogue's detail pane (master–detail, PLAN ruling 1: instance surface
// only). This is the ONLY surface that renders a non-ready run — the
// generating/failed bodies live here, because a project is attached only
// once a run is ready and so never sees one. A READY run is rendered by the
// shared ResultsPackageView, exactly as a project's tab renders it; this pane
// adds only its housekeeping chrome (pin/unpin, guarded delete, "in use by").
export function RunCatalogDetailPane(p: {
  run: RunCatalogItem;
  liveProgress: RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const progress = () => p.liveProgress ?? p.run.progress;

  // Guarded hard delete (fork ruling 3): ONE act — catalog row, files and
  // cached results — with no archived state and no automatic GC. The server
  // refuses while a project points at the package or it is still generating;
  // the pane states the reason rather than hiding the button, so an
  // undeletable package is never a mystery. No refetch on success: the SSE
  // push updates the store and the sidebar's pin effect moves selection.
  const deleteBlockedReason = (): string | null => {
    if (p.run.status === "generating") {
      return t3({
        en: "Cannot delete while generating",
        fr: "Suppression impossible pendant la génération",
        pt: "Não é possível eliminar durante a geração",
      });
    }
    if (isPinned()) {
      return t3({
        en: "Cannot delete while pinned",
        fr: "Suppression impossible tant qu'il est épinglé",
        pt: "Não é possível eliminar enquanto estiver fixado",
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

  const deletePackage = createDeleteAction(
    {
      text: t3({
        en: "Delete this results package? Its files and cached results are permanently removed.",
        fr: "Supprimer ce paquet de résultats ? Ses fichiers et ses résultats mis en cache sont définitivement supprimés.",
        pt: "Eliminar este pacote de resultados? Os seus ficheiros e resultados em cache são removidos permanentemente.",
      }),
      itemList: [p.run.label],
    },
    () => serverActions.deleteRun({ run_id: p.run.id }),
  );

  // Pin / unpin (SYSTEM_08 "The pinned package + followers"): an explicit
  // act on a ready package. Pinning physically repoints every project that
  // follows the pin, so the confirm lists them first and the result reports
  // which moved, were skipped (locked) or failed — and whether a later
  // pin-move superseded this one midway. Unpin is run-keyed and moves
  // nothing. No refetch on success: the pin push + catalogue nonce update the
  // store, and both badges/buttons derive from `instanceState.pinnedRunId`.
  const isPinned = () => p.run.id === instanceState.pinnedRunId;

  const pinPackage = createButtonAction(
    async () => {
      const followersRes = await serverActions.listFollowPinnedProjects({});
      if (followersRes.success === false) {
        return followersRes;
      }
      const followers = followersRes.data;
      const ok = await openConfirm({
        title: t3({
          en: "Pin this results package?",
          fr: "Épingler ce paquet de résultats ?",
          pt: "Fixar este pacote de resultados?",
        }),
        text: (
          <div class="ui-spy-sm">
            <div>
              {t3({
                en: "It becomes the instance's pinned package.",
                fr: "Il devient le paquet épinglé de l'instance.",
                pt: "Passa a ser o pacote fixado da instância.",
              })}
            </div>
            <Show
              when={followers.length > 0}
              fallback={
                <div>
                  {t3({
                    en: "No project follows the pinned package, so no project is switched.",
                    fr: "Aucun projet ne suit le paquet épinglé, donc aucun projet n'est basculé.",
                    pt: "Nenhum projeto segue o pacote fixado, pelo que nenhum projeto é mudado.",
                  })}
                </div>
              }
            >
              <div>
                {t3({
                  en: "These projects follow the pinned package and are switched to it now:",
                  fr: "Ces projets suivent le paquet épinglé et y sont basculés maintenant :",
                  pt: "Estes projetos seguem o pacote fixado e mudam para ele agora:",
                })}
              </div>
              <ul class="list-disc pl-5">
                <For each={followers}>
                  {(f) => (
                    <li>
                      {f.label}
                      <Show when={f.isLocked}>
                        {` (${t3({ en: "locked — skipped", fr: "verrouillé — ignoré", pt: "bloqueado — ignorado" })})`}
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        ),
        confirmButtonLabel: t3({ en: "Pin", fr: "Épingler", pt: "Fixar" }),
      });
      if (!ok) {
        return { success: true, data: null };
      }
      return await serverActions.pinResultsPackage({ run_id: p.run.id });
    },
    async (result: PinResultsPackageResult | null) => {
      if (result === null) {
        return;
      }
      const lines: string[] = [];
      if (result.repointed.length > 0) {
        lines.push(
          `${t3({ en: "Projects updated", fr: "Projets mis à jour", pt: "Projetos atualizados" })}: ${result.repointed.join(", ")}`,
        );
      }
      if (result.skippedLocked.length > 0) {
        lines.push(
          `${t3({ en: "Skipped (locked)", fr: "Ignorés (verrouillés)", pt: "Ignorados (bloqueados)" })}: ${result.skippedLocked.join(", ")}`,
        );
      }
      if (result.failed.length > 0) {
        lines.push(
          `${t3({ en: "Failed to update", fr: "Échec de la mise à jour", pt: "Falha ao atualizar" })}: ${result.failed.join(", ")}`,
        );
      }
      if (result.supersededMidway) {
        lines.push(
          t3({
            en: "The pinned package was changed again while projects were being switched; the newer pin takes over.",
            fr: "Le paquet épinglé a de nouveau changé pendant le basculement des projets ; le nouvel épinglage prend le relais.",
            pt: "O pacote fixado foi alterado novamente enquanto os projetos eram mudados; a fixação mais recente prevalece.",
          }),
        );
      }
      if (lines.length === 0) {
        lines.push(
          t3({
            en: "No project follows the pinned package, so no project was switched.",
            fr: "Aucun projet ne suit le paquet épinglé, donc aucun projet n'a été basculé.",
            pt: "Nenhum projeto segue o pacote fixado, pelo que nenhum projeto foi mudado.",
          }),
        );
      }
      await openAlert({
        title: t3({
          en: "Package pinned",
          fr: "Paquet épinglé",
          pt: "Pacote fixado",
        }),
        text: (
          <div class="ui-spy-sm">
            <For each={lines}>{(line) => <div>{line}</div>}</For>
          </div>
        ),
        intent: result.failed.length > 0 ? "danger" : undefined,
      });
    },
  );

  const unpinPackage = createButtonAction(() =>
    serverActions.unpinResultsPackage({ run_id: p.run.id }),
  );

  const openViewer: OpenViewer = (element, moduleId) => {
    void p.openEditor({
      element,
      props: {
        runId: p.run.id,
        moduleId: getValidatedModuleId(moduleId),
        moduleLabel: moduleLabel(moduleId),
      },
    });
  };

  const housekeeping = (
    <>
      <Switch>
        <Match when={isPinned()}>
          <Button
            size="sm"
            outline
            state={unpinPackage.state()}
            onClick={unpinPackage.click}
          >
            {t3({ en: "Unpin", fr: "Désépingler", pt: "Desafixar" })}
          </Button>
        </Match>
        <Match when={p.run.status === "ready"}>
          <Button
            size="sm"
            outline
            state={pinPackage.state()}
            onClick={pinPackage.click}
          >
            {t3({ en: "Pin", fr: "Épingler", pt: "Fixar" })}
          </Button>
        </Match>
      </Switch>
      <Switch>
        <Match when={deleteBlockedReason()} keyed>
          {(reason) => <div class="ui-text-caption">{reason}</div>}
        </Match>
        <Match when={deleteBlockedReason() === null}>
          <Button
            size="sm"
            intent="danger"
            outline
            iconName="trash"
            onClick={deletePackage.click}
          >
            {t3(TC.delete)}
          </Button>
        </Match>
      </Switch>
    </>
  );

  const usageLine = (
    <Show
      when={p.run.attachedProjects.length > 0}
      fallback={
        <div
          class="ui-text-caption"
          data-tour="instance-results-packages-usage"
        >
          {t3({
            en: "Not attached to any project",
            fr: "Rattaché à aucun projet",
            pt: "Não anexado a nenhum projeto",
          })}
        </div>
      }
    >
      <Callout data-tour="instance-results-packages-usage" noBorder>
        <span class="font-700">
          {t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}:
        </span>{" "}
        {p.run.attachedProjects.map((project) => project.label).join(", ")}
      </Callout>
    </Show>
  );

  return (
    <div
      class="ui-pad ui-spy h-full overflow-auto"
      data-tour="instance-results-packages-card"
    >
      <Switch>
        <Match when={p.run.status === "ready"}>
          <ResultsPackageView
            run={p.run}
            headerActions={housekeeping}
            headerNote={usageLine}
            openEditor={p.openEditor}
          />
        </Match>
        <Match when={p.run.status !== "ready"}>
          <div class="ui-gap flex items-center">
            <div class="font-700 flex-1 truncate">{p.run.label}</div>
            <Show when={isPinned()}>
              <PinnedBadge />
            </Show>
            <RunStatusBadge status={p.run.status} />
            {housekeeping}
          </div>
          <ResultsPackageProvenanceLine run={p.run} />
          {usageLine}
          <Switch>
            <Match when={p.run.status === "generating" && progress()} keyed>
              {(keyedProgress) => (
                <div class="ui-spy-sm">
                  <div class="ui-gap-sm flex flex-wrap">
                    <For each={keyedProgress.moduleOrder}>
                      {(moduleId) => (
                        <ModuleProgressChip
                          label={moduleLabel(moduleId)}
                          status={
                            keyedProgress.moduleStatus[moduleId] ?? "pending"
                          }
                        />
                      )}
                    </For>
                  </div>
                  <Show when={keyedProgress.currentModuleId} keyed>
                    {(currentModuleId) => (
                      <div class="ui-text-caption truncate font-mono">
                        {p.latestRLine(currentModuleId) ?? "..."}
                      </div>
                    )}
                  </Show>
                </div>
              )}
            </Match>
            <Match when={p.run.status === "failed"}>
              <div class="ui-spy-sm">
                <FailedErrorDetail
                  errorDetail={progress()?.errorDetail ?? null}
                />
                {/* The module list comes from the stored progress, and viewers are
                    offered only for modules that started — a pending module never
                    got a workspace. A crash/pipeline failure publishes the partial
                    workspace for inspection (no manifest, so there is no summary);
                    boot-interrupted and pre-worker-failed runs have NO directory at
                    all, so their viewers open onto the typed no-script/log/files
                    states — accepted, degrades loudly. */}
                <Show when={progress()} keyed>
                  {(keyedProgress) => (
                    <For each={keyedProgress.moduleOrder}>
                      {(moduleId) => {
                        const status =
                          keyedProgress.moduleStatus[moduleId] ?? "pending";
                        return (
                          <div class="ui-gap-sm flex items-center text-sm">
                            <div class="flex w-64">
                              <ModuleProgressChip
                                label={moduleLabel(moduleId)}
                                status={status}
                              />
                            </div>
                            <Show when={status !== "pending"}>
                              <FailedModuleViewerButtons
                                moduleId={moduleId}
                                openViewer={openViewer}
                              />
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  )}
                </Show>
              </div>
            </Match>
          </Switch>
        </Match>
      </Switch>
    </div>
  );
}

// A failed run's started modules: script, log and the partial workspace's
// files (a failed run has no manifest, so files come from the listing route
// via the ViewFiles editor rather than the T2 detail).
function FailedModuleViewerButtons(p: {
  moduleId: string;
  openViewer: OpenViewer;
}) {
  return (
    <>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewScript, p.moduleId)}
        >
          {t3({ en: "Script", fr: "Script", pt: "Script" })}
        </Button>
      </Show>
      <Show when={canViewPackageLogs()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewLogs, p.moduleId)}
        >
          {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
        </Button>
      </Show>
      <Show when={canViewPackageContents()}>
        <Button
          size="sm"
          outline
          onClick={() => p.openViewer(ViewFiles, p.moduleId)}
        >
          {t3({ en: "Files", fr: "Fichiers", pt: "Ficheiros" })}
        </Button>
      </Show>
    </>
  );
}
