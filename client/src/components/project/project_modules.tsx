import {
  InstalledModuleSummary,
  ProjectDetail,
  getPossibleModules,
  t3,
  TC,
  type ModuleId,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  type MenuItem,
  OpenEditorProps,
  getEditorWrapper,
  openAlert,
  openComponent,
  showMenu,
  timActionButton,
} from "panther";
import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { moduleLatestCommits, setModuleLatestCommits } from "~/state/t4_ui";
import { getInstanceCountryIso3 } from "~/state/instance/t1_store";
import { DirtyStatus } from "~/components/DirtyStatus";
import {
  useOptimisticSetLastUpdated,
  useOptimisticSetProjectLastUpdated,
  useProjectDirtyStates,
  useRLogs,
  useProjectDetail,
} from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
import { SettingsForProjectModuleGeneric } from "../project_module_settings/settings_generic";
import { ViewFiles } from "./view_files";
import { ViewLogs } from "./view_logs";
import { ViewScript } from "./view_script";
import { UpdateAllModules } from "./update_all_modules";
import { UpdateModule } from "./update_module";

type Props = {
  isGlobalAdmin: boolean;
  canConfigureModules: boolean;
  canRunModules: boolean;
  canViewScriptCode: boolean;
};

export function ProjectModules(p: Props) {
  const projectDetail = useProjectDetail();
  const { openEditor, EditorWrapper } = getEditorWrapper();
  const [checkingUpdates, setCheckingUpdates] = createSignal(false);
  const [checkError, setCheckError] = createSignal<string | undefined>(undefined);

  async function fetchLatestCommits() {
    setCheckingUpdates(true);
    setCheckError(undefined);
    try {
      const res = await serverActions.checkModuleUpdates({});
      if (res.success) {
        setModuleLatestCommits(res.data);
      } else {
        setCheckError(res.err);
      }
    } catch {
      setCheckError("Failed to check for updates");
    } finally {
      setCheckingUpdates(false);
    }
  }

  onMount(() => {
    if (moduleLatestCommits() === undefined) {
      fetchLatestCommits();
    }
  });

  function updatesAvailableCount(): number {
    const commits = moduleLatestCommits();
    if (!commits) return 0;
    let count = 0;
    for (const mod of projectDetail.projectModules) {
      const entry = commits.find((c) => c.moduleId === mod.id);
      if (
        entry &&
        (!mod.presentationDefGitRef || entry.latestCommit.sha !== mod.presentationDefGitRef)
      ) {
        count++;
      }
    }
    return count;
  }

  async function updateAllModules() {
    await openComponent({
      element: UpdateAllModules,
      props: {
        projectId: projectDetail.id,
        modules: projectDetail.projectModules,
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            heading={t3({ en: "Modules", fr: "Modules" })}
            class="border-base-300"
            ensureHeightAsIfButton
          >
            <div class="ui-gap-sm flex items-center">
              <Show when={checkError()}>
                <span class="text-danger text-sm">
                  {checkError()}
                </span>
              </Show>
              <Show when={updatesAvailableCount() > 0}>
                <span class="text-warning font-500 text-sm">
                  {updatesAvailableCount()}{" "}
                  {t3({
                    en: "updates available",
                    fr: "mises à jour disponibles",
                  })}
                </span>
              </Show>
              <Button
                onClick={fetchLatestCommits}
                iconName="refresh"
                outline
                state={checkingUpdates() ? { status: "loading" } : undefined}
              >
                {t3({
                  en: "Check for updates",
                  fr: "Vérifier les mises à jour",
                })}
              </Button>
              <Show
                when={
                  !projectDetail.isLocked &&
                  projectDetail.projectModules.length > 0 &&
                  (p.isGlobalAdmin || p.canConfigureModules)
                }
              >
                <Button onClick={updateAllModules} iconName="refresh" outline>
                  {t3({ en: "Update all", fr: "Tout mettre à jour" })}
                </Button>
              </Show>
            </div>
          </HeadingBar>
        }
      >
        <div class="ui-pad ui-spy">
          <For each={getPossibleModules(getInstanceCountryIso3())}>
            {(possibleModuleDef) => {
              return (
                <Switch>
                  <Match
                    when={projectDetail.projectModules.find(
                      (m) => m.id === possibleModuleDef.id,
                    )}
                    keyed
                  >
                    {(keyedInstalledModule) => {
                      return (
                        <InstalledModulePresentation
                          projectDetail={projectDetail}
                          projectId={projectDetail.id}
                          isGlobalAdmin={p.isGlobalAdmin}
                          canConfigureModules={p.canConfigureModules}
                          canRunModules={p.canRunModules}
                          canViewScriptCode={p.canViewScriptCode}
                          thisInstalledModule={keyedInstalledModule}
                          allInstalledModules={projectDetail.projectModules}
                          openEditor={openEditor}
                        />
                      );
                    }}
                  </Match>
                  <Match when={true}>
                    <UninstalledModulePresentation
                      projectDetail={projectDetail}
                      projectId={projectDetail.id}
                      isGlobalAdmin={p.isGlobalAdmin}
                      canConfigureModules={p.canConfigureModules}
                      thisUninstalledModuleId={possibleModuleDef.id}
                      thisUninstalledModuleLabel={possibleModuleDef.label}
                      thisUninstalledModulePrerequisiteModules={
                        possibleModuleDef.prerequisiteModules
                      }
                      currentModules={projectDetail.projectModules}
                    />
                  </Match>
                </Switch>
              );
            }}
          </For>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type InstalledModuleProps = {
  projectId: string;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  canConfigureModules: boolean;
  canRunModules: boolean;
  canViewScriptCode: boolean;
  thisInstalledModule: InstalledModuleSummary;
  allInstalledModules: InstalledModuleSummary[];
  openEditor: <TProps, TReturn>(
    v: OpenEditorProps<TProps, TReturn>,
  ) => Promise<TReturn | undefined>;
};

function InstalledModulePresentation(p: InstalledModuleProps) {
  const pds = useProjectDirtyStates();
  const rLogs = useRLogs();

  const hasUpdateAvailable = createMemo(() => {
    const commits = moduleLatestCommits();
    const installedGitRef = p.thisInstalledModule.presentationDefGitRef;
    const moduleId = p.thisInstalledModule.id;
    if (!commits) return false;
    const entry = commits.find((c) => c.moduleId === moduleId);
    if (!entry) return false;
    return !installedGitRef || entry.latestCommit.sha !== installedGitRef;
  });

  async function editSettings() {
    if (!p.thisInstalledModule.hasParameters) {
      const _res = await openAlert({
        text: t3({
          en: "There are no settings for this module!",
          fr: "Ce module n'a aucun paramètre !",
        }),
      });
      return;
    }
    const _res = await p.openEditor({
      element: SettingsForProjectModuleGeneric,
      props: {
        projectId: p.projectId,
        projectIsLocked: p.projectDetail.isLocked,
        installedModuleId: p.thisInstalledModule.id,
        installedModuleLabel: p.thisInstalledModule.label,
        moduleLabel: p.thisInstalledModule.label,
      },
    });
  }

  async function disableModule() {
    for (const otherMod of getPossibleModules(getInstanceCountryIso3())) {
      if (otherMod.prerequisiteModules.includes(p.thisInstalledModule.id)) {
        if (p.allInstalledModules.some((m) => m.id === otherMod.id)) {
          await openAlert({
            text: `${t3({ en: "In order to disable this module you must first disable the modules that depend on it, including", fr: "Pour désactiver ce module, les modules qui en dépendent doivent d'abord être désactivés, y compris :" })} ${otherMod.label}`,
          });
          return;
        }
      }
    }
    const res = await serverActions.uninstallModule({
      projectId: p.projectId,
      module_id: p.thisInstalledModule.id,
    });
    if (!res.success) {
      await openAlert({ text: res.err });
    }
  }

  async function updateModule() {
    const _res = await openComponent({
      element: UpdateModule,
      props: {
        projectId: p.projectDetail.id,
        moduleId: p.thisInstalledModule.id,
      },
    });
  }

  // Actions

  async function showFiles() {
    const _res = await p.openEditor({
      element: ViewFiles,
      props: {
        projectId: p.projectDetail.id,
        moduleId: p.thisInstalledModule.id,
        moduleLabel: p.thisInstalledModule.label,
        resultsObjectIds:
          p.thisInstalledModule.moduleDefinitionResultsObjectIds,
      },
    });
  }

  async function showLogs() {
    const _res = await p.openEditor({
      element: ViewLogs,
      props: {
        projectId: p.projectDetail.id,
        moduleId: p.thisInstalledModule.id,
        moduleLabel: p.thisInstalledModule.label,
      },
    });
  }

  async function showScript() {
    const _res = await p.openEditor({
      element: ViewScript,
      props: {
        projectId: p.projectDetail.id,
        moduleId: p.thisInstalledModule.id,
        moduleLabel: p.thisInstalledModule.label,
      },
    });
  }

  async function rerunModule() {
    const res = await serverActions.rerunModule({
      projectId: p.projectId,
      module_id: p.thisInstalledModule.id,
    });
    if (!res.success) {
      await openAlert({ text: res.err });
    }
  }

  function openMoreMenu(e: MouseEvent) {
    const dirtyState = pds.moduleDirtyStates[p.thisInstalledModule.id];
    const isReadyOrError = dirtyState === "ready" || dirtyState === "error";
    const isReady = dirtyState === "ready";
    const canRun = !p.projectDetail.isLocked && (p.isGlobalAdmin || p.canRunModules);
    const canConfigure = !p.projectDetail.isLocked && (p.isGlobalAdmin || p.canConfigureModules);
    const canViewScript = p.isGlobalAdmin || p.canViewScriptCode;

    const items: MenuItem[] = [];

    if (isReadyOrError && canViewScript) {
      items.push({ label: t3({ en: "Script", fr: "Script" }), icon: "code", onClick: () => showScript() });
    }
    if (isReadyOrError) {
      items.push({ label: t3({ en: "Logs", fr: "Journaux des données" }), icon: "file", onClick: () => showLogs() });
    }
    if (isReady) {
      items.push({ label: t3({ en: "Files", fr: "Fichiers" }), icon: "folder", onClick: () => showFiles() });
    }
    if (isReadyOrError && canRun) {
      items.push({ label: t3({ en: "Re-run", fr: "Relancer" }), icon: "refresh", onClick: () => rerunModule() });
    }
    if (canConfigure) {
      if (items.length > 0) {
        items.push({ type: "divider" });
      }
      items.push({ label: t3({ en: "Disable", fr: "Désactiver" }), icon: "minus", intent: "danger", onClick: () => disableModule() });
    }

    if (items.length > 0) {
      showMenu({ x: e.clientX, y: e.clientY, items });
    }
  }

  return (
    <div class="border-base-300 rounded border">
      <div class="ui-pad border-base-300 ui-gap-sm flex flex-wrap items-center justify-end border-b">
        <div class="font-700 flex-none text-lg">
          <span class="mr-4">{p.thisInstalledModule.label}</span>
          <DirtyStatus
            id={p.thisInstalledModule.id}
            moduleDirtyStates={pds.moduleDirtyStates}
          />
          <Show when={hasUpdateAvailable()}>
            <span class="bg-warning/15 text-warning font-500 ml-2 rounded px-2 py-0.5 text-xs">
              {t3({ en: "Update available", fr: "Mise à jour disponible" })}
            </span>
          </Show>
        </div>
        <div class="flex-1"></div>
        <Show when={p.isGlobalAdmin || p.canConfigureModules}>
          <Show when={!p.projectDetail.isLocked}>
            <Button onClick={updateModule} iconName="refresh">
              {t3(TC.update)}
            </Button>
          </Show>
          <Button onClick={editSettings} iconName="settings">
            {t3(TC.settings)}
          </Button>
        </Show>
        <Button onClick={openMoreMenu} iconName="moreVertical" outline />
      </div>
      <Show
        when={
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready" ||
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "running" ||
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "error"
        }
        fallback={
          <div class="ui-pad text-neutral text-xs">
            {t3({
              en: "Waiting for data or upstream modules",
              fr: "En attente des données ou des modules en amont",
            })}
          </div>
        }
      >
        <div class="ui-pad">
          <Switch>
            <Match
              when={pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready"}
            >
              {(() => {
                const computeUpdatedAt = p.thisInstalledModule.computeDefUpdatedAt;
                const definitionUpdatedAt = p.thisInstalledModule.presentationDefUpdatedAt;
                const lastRunDate = new Date(
                  pds.moduleLastRun[p.thisInstalledModule.id],
                );
                const resultsStale = computeUpdatedAt
                  ? new Date(computeUpdatedAt) > lastRunDate
                  : false;
                return (
                  <div class="text-neutral flex flex-col gap-1 text-xs">
                    <div class="flex items-center gap-2">
                      <span>
                        {t3({ en: "Compute definitions", fr: "Définitions de calcul" })}:{" "}
                        {computeUpdatedAt ? new Date(computeUpdatedAt).toLocaleString() : "—"}
                      </span>
                      <Show when={p.thisInstalledModule.computeDefGitRef}>
                        <span class="font-mono">
                          ({p.thisInstalledModule.computeDefGitRef!.slice(0, 7)})
                        </span>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <span>
                        {t3({ en: "Presentation definitions", fr: "Définitions de présentation" })}:{" "}
                        {definitionUpdatedAt ? new Date(definitionUpdatedAt).toLocaleString() : "—"}
                      </span>
                      <Show when={p.thisInstalledModule.presentationDefGitRef}>
                        <span class="font-mono">
                          ({p.thisInstalledModule.presentationDefGitRef!.slice(0, 7)})
                        </span>
                      </Show>
                    </div>
                    <div
                      class={`flex items-center gap-2 ${resultsStale ? "text-danger" : ""}`}
                    >
                      <span>
                        {t3({ en: "Last run", fr: "Dernière exécution" })}:{" "}
                        {lastRunDate.toLocaleString()}
                      </span>
                      <Show when={pds.moduleLastRunGitRef[p.thisInstalledModule.id]}>
                        <span class="font-mono">
                          ({pds.moduleLastRunGitRef[p.thisInstalledModule.id].slice(0, 7)})
                        </span>
                      </Show>
                      <Show when={resultsStale}>
                        <span class="font-700">
                          {t3({
                            en: "— results outdated",
                            fr: "— résultats obsolètes",
                          })}
                        </span>
                      </Show>
                    </div>
                  </div>
                );
              })()}
            </Match>
            <Match
              when={
                pds.moduleDirtyStates[p.thisInstalledModule.id] === "running"
              }
            >
              <div class="truncate text-xs">
                {rLogs[p.thisInstalledModule.id]?.latest ?? "..."}
              </div>
            </Match>
            <Match
              when={pds.moduleDirtyStates[p.thisInstalledModule.id] === "error"}
            >
              <div class="text-danger truncate text-xs">
                {t3({
                  en: "View logs to determine the error",
                  fr: "Consultez les journaux pour déterminer l'erreur",
                })}
              </div>
            </Match>
          </Switch>
        </div>
      </Show>
    </div>
  );
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type UninstalledModuleProps = {
  projectId: string;
  projectDetail: ProjectDetail;
  isGlobalAdmin: boolean;
  canConfigureModules: boolean;
  thisUninstalledModuleId: ModuleId;
  thisUninstalledModuleLabel: string;
  thisUninstalledModulePrerequisiteModules: string[];
  currentModules: InstalledModuleSummary[];
};

function UninstalledModulePresentation(p: UninstalledModuleProps) {
  const optimisticSetLastUpdated = useOptimisticSetLastUpdated();
  const optimisticSetProjectLastUpdated = useOptimisticSetProjectLastUpdated();

  const enableModule = timActionButton(async () => {
    for (const prereq of p.thisUninstalledModulePrerequisiteModules) {
      if (!p.currentModules.some((m) => m.id === prereq)) {
        const missingModLabel =
          getPossibleModules(getInstanceCountryIso3()).find((m) => m.id === prereq)?.label ?? prereq;
        return {
          success: false,
          err: `${t3({ en: "In order to install this module you must first install the module", fr: "Pour installer ce module, vous devez d'abord installer le module" })} ${missingModLabel}`,
        };
      }
    }
    const res = await serverActions.installModule({
      projectId: p.projectId,
      module_id: p.thisUninstalledModuleId,
    });
    if (res.success) {
      for (const poId of res.data.presObjIdsWithNewLastUpdateds) {
        optimisticSetLastUpdated(
          "presentation_objects",
          poId,
          res.data.lastUpdated,
        );
      }
      optimisticSetProjectLastUpdated(res.data.lastUpdated);
    }
    return res;
  });

  return (
    <div class="ui-pad border-base-300 col-span-1 flex items-center rounded border">
      <div class="font-700 flex-1 text-lg">{p.thisUninstalledModuleLabel}</div>
      <Show
        when={
          !p.projectDetail.isLocked &&
          (p.isGlobalAdmin || p.canConfigureModules)
        }
        fallback={
          <div class="font-400 text-neutral text-sm">
            {t3({ en: "Deactivated", fr: "Désactivé" })}
          </div>
        }
      >
        <div class="">
          <Button
            onClick={enableModule.click}
            state={enableModule.state()}
            outline
          >
            {t3({ en: "Enable", fr: "Activer" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
