import { t3, TC, type RunCatalogItem, type RunProgress } from "lib";
import {
  Button,
  Callout,
  createButtonAction,
  createDeleteAction,
  getEditorWrapper,
  openConfirm,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import {
  FailedErrorDetail,
  ResultsPackageProvenanceLine,
  ResultsPackageView,
} from "~/components/results_packages/package_view/package_view";
import {
  ModuleProgressChip,
  PinnedBadge,
  RunStatusBadge,
  canViewPackageContents,
  canViewPackageLogs,
  moduleLabel,
} from "~/components/results_packages/package_view/status";
import { ViewFiles } from "~/components/results_packages/package_view/view_files";
import { ViewLogs } from "~/components/results_packages/package_view/view_logs";
import { ViewScript } from "~/components/results_packages/package_view/view_script";
import { PRODUCT_TYPE_REGISTRY } from "~/components/products/product_types";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Viewer = typeof ViewScript | typeof ViewLogs | typeof ViewFiles;
type OpenViewer = (element: Viewer, moduleId: string) => void;

// The catalogue's detail pane (master–detail, PLAN ruling 1: instance surface
// only). This is the ONLY surface that renders a non-ready run: the
// generating/failed bodies live here, because a product points only at a
// ready run and so never sees one. A READY run is rendered by the shared
// ResultsPackageView; this pane adds only its housekeeping chrome (pin/unpin,
// guarded delete, "in use by").
export function RunCatalogDetailPane(p: {
  run: RunCatalogItem;
  liveProgress: RunProgress | undefined;
  latestRLine: (moduleId: string) => string | undefined;
  openEditor: ReturnType<typeof getEditorWrapper>["openEditor"];
}) {
  const progress = () => p.liveProgress ?? p.run.progress;

  // Guarded hard delete (fork ruling 3): ONE act (catalog row, files and
  // cached results) with no archived state and no automatic GC. The server
  // refuses while a product points at the package or it is still generating;
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
    if (p.run.attachedProducts.length > 0) {
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

  // Pin / unpin (SYSTEM_08 "The pinned package"): an explicit act on a ready
  // package that moves no product. Unpin is run-keyed. No refetch on success:
  // the pin push and catalogue nonce update the store, and both badges and
  // buttons derive from `instanceState.pinnedRunId`.
  const isPinned = () => p.run.id === instanceState.pinnedRunId;

  const pinPackage = createButtonAction(async () => {
    const ok = await openConfirm({
      title: t3({
        en: "Pin this results package?",
        fr: "Épingler ce paquet de résultats ?",
        pt: "Fixar este pacote de resultados?",
      }),
      text: t3({
        en: "It becomes the instance's pinned package: new decks and reports start on it. Existing products keep their package.",
        fr: "Il devient le paquet épinglé de l'instance : les nouvelles présentations et les nouveaux rapports l'utilisent. Les produits existants gardent leur paquet.",
        pt: "Passa a ser o pacote fixado da instância: as novas apresentações e os novos relatórios começam com ele. Os produtos existentes mantêm o seu pacote.",
      }),
      confirmButtonLabel: t3({ en: "Pin", fr: "Épingler", pt: "Fixar" }),
    });
    if (!ok) {
      return { success: true };
    }
    return await serverActions.pinResultsPackage({ run_id: p.run.id });
  });

  const unpinPackage = createButtonAction(() =>
    serverActions.unpinResultsPackage({ run_id: p.run.id }),
  );

  const openViewer: OpenViewer = (element, moduleId) => {
    void p.openEditor({
      element,
      props: {
        runId: p.run.id,
        // Read plane: a manifest module id is plain text here (PLAN_1a §0
        // clause 3).
        moduleId,
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
      when={p.run.attachedProducts.length > 0}
      fallback={
        <div
          class="ui-text-caption"
          data-tour="instance-results-packages-usage"
        >
          {t3({
            en: "Not used by any deck or report",
            fr: "Utilisé par aucune présentation ni aucun rapport",
            pt: "Não usado por nenhuma apresentação nem relatório",
          })}
        </div>
      }
    >
      <Callout data-tour="instance-results-packages-usage" noBorder>
        <span class="font-700">
          {t3({ en: "In use by", fr: "Utilisé par", pt: "Em uso por" })}:
        </span>{" "}
        {p.run.attachedProducts
          .map(
            (product) =>
              `${product.label} (${PRODUCT_TYPE_REGISTRY[product.type].label()})`,
          )
          .join(", ")}
      </Callout>
    </Show>
  );

  return (
    <div
      class="ui-pad ui-spy h-full overflow-y-scroll"
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
                    offered only for modules that started: a pending module never
                    got a workspace. A crash/pipeline failure publishes the partial
                    workspace for inspection (no manifest, so there is no summary);
                    boot-interrupted and pre-worker-failed runs have NO directory at
                    all, so their viewers open onto the typed no-script/log/files
                    states: accepted, degrades loudly. */}
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
