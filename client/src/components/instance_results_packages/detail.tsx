import {
  getValidatedModuleId,
  t3,
  TC,
  type PinResultsPackageResult,
  type RunCatalogDetail,
  type RunCatalogItem,
  type RunProgress,
} from "lib";
import {
  Button,
  Card,
  StateHolderWrapper,
  createButtonAction,
  createDeleteAction,
  formatFileSize,
  getEditorWrapper,
  openAlert,
  openConfirm,
  type StateHolder,
} from "panther";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import {
  instancePackageInternalsSource,
  type PackageInternalsSource,
} from "~/components/_shared/results_package/internals_source";
import {
  FailedErrorDetail,
  ResultsPackageProvenanceLine,
} from "~/components/_shared/results_package/package_contents";
import {
  ModuleProgressChip,
  PinnedBadge,
  RunStatusBadge,
  moduleLabel,
} from "~/components/_shared/results_package/status";
import { ViewFiles } from "~/components/_shared/results_package/view_files";
import { ViewLogs } from "~/components/_shared/results_package/view_logs";
import { ViewScript } from "~/components/_shared/results_package/view_script";
import { serverActions } from "~/server_actions";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;
type OpenViewer = (element: Viewer, moduleId: string) => void;

// The catalogue's detail pane (master–detail, PLAN ruling 1: instance surface
// only). This is the ONLY surface that renders a non-ready run — the
// generating/failed bodies live here, not in the shared
// ResultsPackageContents, because a project is attached only once a run is
// ready and so never sees one; the ready view diverges from the project
// tab's by design (settings + inline files). Reaching this pane IS the
// permission (can_configure_data gates the whole surface), so the internals
// source is unconditionally entitled.
export function RunCatalogDetailPane(p: {
  run: RunCatalogItem;
  liveProgress: RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const progress = () => p.liveProgress ?? p.run.progress;
  const internals = () => instancePackageInternalsSource(p.run.id, true);

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
    if (p.run.pinned) {
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
  // act on a ready package.
  // Pinning physically repoints every project that follows the pin, so the
  // confirm says so and the result reports which projects moved, were
  // skipped (locked) or failed. Unpin moves nothing. No refetch on success:
  // the pin push + catalogue nonce update the store.
  const pinPackage = createButtonAction(
    async () => {
      const ok = await openConfirm({
        title: t3({
          en: "Pin this results package?",
          fr: "Épingler ce paquet de résultats ?",
          pt: "Fixar este pacote de resultados?",
        }),
        text: t3({
          en: "It becomes the instance's pinned package. Every project set to follow the pinned package is switched to it now.",
          fr: "Il devient le paquet épinglé de l'instance. Chaque projet configuré pour suivre le paquet épinglé y est basculé maintenant.",
          pt: "Passa a ser o pacote fixado da instância. Todos os projetos configurados para seguir o pacote fixado mudam para ele agora.",
        }),
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
      if (lines.length > 0) {
        await openAlert({
          title: t3({ en: "Package pinned", fr: "Paquet épinglé", pt: "Pacote fixado" }),
          text: lines.join("\n"),
          intent: result.failed.length > 0 ? "danger" : undefined,
        });
      }
    },
  );

  const unpinPackage = createButtonAction(() =>
    serverActions.unpinResultsPackage({}),
  );

  const openViewer: OpenViewer = (element, moduleId) => {
    void p.openEditor({
      element,
      props: {
        source: internals(),
        moduleId: getValidatedModuleId(moduleId),
        moduleLabel: moduleLabel(moduleId),
      },
    });
  };

  return (
    <div class="ui-pad ui-spy h-full overflow-auto">
      <div class="ui-gap flex items-center">
        <div class="font-700 flex-1 truncate">{p.run.label}</div>
        <Show when={p.run.pinned}>
          <PinnedBadge />
        </Show>
        <RunStatusBadge status={p.run.status} />
        <Switch>
          <Match when={p.run.pinned}>
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
      </div>

      <ResultsPackageProvenanceLine run={p.run} showDiskSize />

      <div class="ui-text-caption">
        <Show
          when={p.run.attachedProjects.length > 0}
          fallback={t3({
            en: "Not attached to any project",
            fr: "Rattaché à aucun projet",
            pt: "Não anexado a nenhum projeto",
          })}
        >
          {`${t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}: ${p.run.attachedProjects
            .map((project) => project.label)
            .join(", ")}`}
        </Show>
      </div>

      <Switch>
        <Match when={p.run.status === "generating" && progress()} keyed>
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
            <FailedErrorDetail errorDetail={progress()?.errorDetail ?? null} />
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
                          <ViewerButtons
                            moduleId={moduleId}
                            openViewer={openViewer}
                            files
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
        <Match when={p.run.status === "ready"}>
          <Show when={p.run.summary} keyed>
            {(summary) => (
              <div class="text-base-content-muted text-sm">
                {summary.moduleIds.length}{" "}
                {t3({ en: "modules", fr: "modules", pt: "módulos" })} ·{" "}
                {summary.metricCount}{" "}
                {t3({ en: "metrics", fr: "métriques", pt: "métricas" })}
              </div>
            )}
          </Show>
          <ReadyModulesSection
            run={p.run}
            internals={internals()}
            openViewer={openViewer}
          />
        </Match>
      </Switch>
    </div>
  );
}

function ViewerButtons(p: {
  moduleId: string;
  openViewer: OpenViewer;
  files: boolean;
}) {
  return (
    <>
      <Button
        size="sm"
        outline
        onClick={() => p.openViewer(ViewScript, p.moduleId)}
      >
        {t3({ en: "Script", fr: "Script", pt: "Script" })}
      </Button>
      <Button
        size="sm"
        outline
        onClick={() => p.openViewer(ViewLogs, p.moduleId)}
      >
        {t3({ en: "Logs", fr: "Journaux", pt: "Registos" })}
      </Button>
      <Show when={p.files}>
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

function ReadyModulesSection(p: {
  run: RunCatalogItem;
  internals: PackageInternalsSource;
  openViewer: OpenViewer;
}) {
  // T3 fetch (PROTOCOL_APP_STATE): on-demand, not cached — a ready run dir is
  // immutable, so there is nothing to invalidate. Selection changes remount
  // this whole component (the pane's keyed Show), so each mount fetches once;
  // within a mount the effect re-runs only when a generating run flips ready
  // under the user's eyes. The counter is the mandatory stale-response guard.
  const [detail, setDetail] = createSignal<StateHolder<RunCatalogDetail>>({
    status: "loading",
  });
  let requestCounter = 0;
  createEffect(async () => {
    const runId = p.run.id;
    const status = p.run.status;
    if (status !== "ready") {
      return;
    }
    const requestId = ++requestCounter;
    const res = await serverActions.getRunCatalogDetail({ run_id: runId });
    if (requestId !== requestCounter) {
      return;
    }
    setDetail(
      res.success
        ? { status: "ready", data: res.data }
        : { status: "error", err: res.err },
    );
  });

  const detailError = () => {
    const d = detail();
    return d.status === "error" ? d.err : undefined;
  };

  // A ready run whose manifest cannot be read (unreadable bytes, or written
  // by a newer server on a mixed-version fleet) must not lose the
  // script/log viewers — they are exactly what diagnoses it. Fall back to
  // the summary's module list, which lives in the DB row.
  return (
    <Switch>
      <Match when={detailError()} keyed>
        {(err) => (
          <div class="ui-spy-sm">
            <div class="text-danger text-sm">{err}</div>
            <For each={p.run.summary?.moduleIds ?? []}>
              {(moduleId) => (
                <div class="ui-gap-sm flex items-center text-sm">
                  <div class="w-64 truncate">{moduleLabel(moduleId)}</div>
                  <ViewerButtons
                    moduleId={moduleId}
                    openViewer={p.openViewer}
                    files={false}
                  />
                </div>
              )}
            </For>
          </div>
        )}
      </Match>
      <Match when={detailError() === undefined}>
        <StateHolderWrapper state={detail()} noPad>
          {(keyedDetail) => (
            <div class="ui-spy">
              <For each={keyedDetail.modules}>
                {(mod) => (
                  <ModuleCard
                    module={mod}
                    internals={p.internals}
                    openViewer={p.openViewer}
                  />
                )}
              </For>
            </div>
          )}
        </StateHolderWrapper>
      </Match>
    </Switch>
  );
}

function ModuleCard(p: {
  module: RunCatalogDetail["modules"][number];
  internals: PackageInternalsSource;
  openViewer: OpenViewer;
}) {
  return (
    <Card
      // pad="sm"
      header={moduleLabel(p.module.moduleId)}
      headerRight={
        <div class="ui-gap-sm flex items-center">
          <ViewerButtons
            moduleId={p.module.moduleId}
            openViewer={p.openViewer}
            files={false}
          />
        </div>
      }
      footer={
        <Show
          when={p.module.files.length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "No files",
                fr: "Aucun fichier",
                pt: "Nenhum ficheiro",
              })}
            </div>
          }
        >
          <div class="ui-spy-sm">
            <For each={p.module.files}>
              {(file) => (
                <div class="ui-gap-sm flex items-center">
                  <div class="flex-1 truncate text-sm">{file.name}</div>
                  <div class="ui-text-caption">
                    {formatFileSize(file.sizeBytes, 1)}
                  </div>
                  <Button
                    size="sm"
                    outline
                    iconName="download"
                    href={p.internals.fileHref(
                      getValidatedModuleId(p.module.moduleId),
                      file.name,
                    )}
                    download={file.name}
                  >
                    {t3({
                      en: "Download",
                      fr: "Télécharger",
                      pt: "Transferir",
                    })}
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      }
    >
      <Show
        when={p.module.settings.length > 0}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en: "No parameters configured",
              fr: "Aucun paramètre configuré",
              pt: "Nenhum parâmetro configurado",
            })}
          </div>
        }
      >
        <div class="ui-spy-sm">
          <For each={p.module.settings}>
            {(setting) => (
              <div class="text-sm">
                <span class="text-base-content-muted">{setting.label}</span>
                {`: ${setting.value}`}
              </div>
            )}
          </For>
        </div>
      </Show>
    </Card>
  );
}
