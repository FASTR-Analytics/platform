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
  OpenEditorProps,
  getEditorWrapper,
  openAlert,
  openComponent,
  timActionButton,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
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
import { SettingsForProjectModuleHFA } from "../project_module_settings/settings_hfa";
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
            <Show when={!projectDetail.isLocked && projectDetail.projectModules.length > 0 && (p.isGlobalAdmin || p.canConfigureModules)}>
              <Button onClick={updateAllModules} iconName="refresh" outline>
                {t3({ en: "Update all", fr: "Tout mettre à jour" })}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <div class="ui-pad ui-spy">
          <For each={getPossibleModules()}>
            {(possibleModuleDef) => {
              return (
                <Switch>
                  <Match when={projectDetail.projectModules.find((m) => m.id === possibleModuleDef.id)} keyed>
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

  async function editSettings() {
    if (p.thisInstalledModule.configType === "none") {
      const _res = await openAlert({
        text: t3({ en: "There are no settings for this module!", fr: "Ce module n'a aucun paramètre !" }),
      });
      return;
    }
    if (p.thisInstalledModule.configType === "hfa") {
      const _res = await p.openEditor({
        element: SettingsForProjectModuleHFA,
        props: {
          projectId: p.projectId,
          projectIsLocked: p.projectDetail.isLocked,
          installedModuleId: p.thisInstalledModule.id,
          installedModuleLabel: p.thisInstalledModule.label,
        },
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

  const disableModule = timActionButton(async () => {
    for (const otherMod of getPossibleModules()) {
      if (otherMod.prerequisiteModules.includes(p.thisInstalledModule.id)) {
        if (p.allInstalledModules.some((m) => m.id === otherMod.id)) {
          return {
            success: false,
            err: `${t3({ en: "In order to disable this module you must first disable the modules that depend on it, including", fr: "Pour désactiver ce module, les modules qui en dépendent doivent d'abord être désactivés, y compris :" })} ${otherMod.label}`,
          };
        }
      }
    }
    return await serverActions.uninstallModule({
      projectId: p.projectId,
      module_id: p.thisInstalledModule.id,
    });
  });

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

  const attemptRerunModule = timActionButton(() =>
    serverActions.rerunModule({
      projectId: p.projectId,
      module_id: p.thisInstalledModule.id,
    }),
  );

  return (
    <div class="border-base-300 rounded border">
      <div class="ui-pad border-base-300 ui-gap-sm flex flex-wrap items-center justify-end border-b">
        <div class="font-700 flex-none text-lg">
          <span class="mr-4">{p.thisInstalledModule.label}</span>
          <DirtyStatus
            id={p.thisInstalledModule.id}
            moduleDirtyStates={pds.moduleDirtyStates}
          />
        </div>
        <div class="flex-1"></div>
        {/* <div class="ui-gap-sm flex flex-wrap justify-end"> */}
        <Show
          when={
            pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready" ||
            pds.moduleDirtyStates[p.thisInstalledModule.id] === "error"
          }
        >
          <Show when={p.isGlobalAdmin || p.canViewScriptCode}>
            <Button onClick={showScript} outline>
              {t3({ en: "Script", fr: "Script" })}
            </Button>
          </Show>
          <Button onClick={showLogs} outline>
            {t3({ en: "Logs", fr: "Journaux des données" })}
          </Button>
        </Show>
        <Show
          when={pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready"}
        >
          <Button onClick={showFiles} outline>
            {t3({ en: "Files", fr: "Fichiers" })}
          </Button>
        </Show>
        <Show
          when={
            !p.projectDetail.isLocked && (p.isGlobalAdmin || p.canRunModules)
          }
        >
          <Show
            when={
              pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready" ||
              pds.moduleDirtyStates[p.thisInstalledModule.id] === "error"
            }
          >
            <Button
              onClick={attemptRerunModule.click}
              state={attemptRerunModule.state()}
              outline
            >
              {t3({ en: "Re-run", fr: "Relancer" })}
            </Button>
          </Show>
        </Show>
        <Show when={p.isGlobalAdmin || p.canConfigureModules}>
          <Show when={!p.projectDetail.isLocked}>
            <Button
              onClick={disableModule.click}
              state={disableModule.state()}
              outline
            >
              {t3({ en: "Disable", fr: "Désactiver" })}
            </Button>
            <Button onClick={updateModule} iconName="refresh">
              {t3(TC.update)}
            </Button>
          </Show>
          <Button onClick={editSettings} iconName="settings">
            {t3(TC.settings)}
          </Button>
        </Show>
      </div>
      <Show
        when={
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready" ||
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "running" ||
          pds.moduleDirtyStates[p.thisInstalledModule.id] === "error"
        }
        fallback={
          <div class="ui-pad text-neutral text-xs">
            {t3({ en: "Waiting for data or upstream modules", fr: "En attente des données ou des modules en amont" })}
          </div>
        }
      >
        <div class="ui-pad">
          <Switch>
            <Match
              when={pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready"}
            >
              <div class="flex">
                <div class="ui-spy-sm flex-1">
                  <div class="text-success text-xs">
                    {t3({ en: "Last module install/update", fr: "Dernière installation/mise à jour du module" })}:{" "}
                    {new Date(
                      p.thisInstalledModule.dateInstalled,
                    ).toLocaleString()}{" "}
                    {p.thisInstalledModule.commitSha ? (
                      <span>
                        ({t3({ en: "Commit", fr: "Commit" })}: {p.thisInstalledModule.commitSha.slice(0, 6)})
                      </span>
                    ) : (
                      t3({ en: "No SHA", fr: "Pas de SHA" })
                    )}
                  </div>
                  <div class="text-success text-xs">
                    {t3({ en: "Last run", fr: "Dernière exécution" })}:{" "}
                    {new Date(
                      pds.moduleLastRun[p.thisInstalledModule.id],
                    ).toLocaleString()}{" "}
                    {p.thisInstalledModule.latestRanCommitSha ? (
                      <span>
                        ({t3({ en: "Latest run commit", fr: "Dernier commit exécuté" })}:{" "}
                        {p.thisInstalledModule.latestRanCommitSha.slice(0, 6)})
                      </span>
                    ) : (
                      t3({ en: "No SHA", fr: "Pas de SHA" })
                    )}
                  </div>
                </div>
              </div>
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
                {t3({ en: "View logs to determine the error", fr: "Consultez les journaux pour déterminer l'erreur" })}
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
          getPossibleModules().find((m) => m.id === prereq)?.label ?? prereq;
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
          <div class="font-400 text-neutral text-sm">{t3({ en: "Deactivated", fr: "Désactivé" })}</div>
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
