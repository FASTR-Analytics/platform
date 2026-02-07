import {
  InstalledModuleSummary,
  ProjectDetail,
  _POSSIBLE_MODULES,
  t,
  t2,
  T,
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
import { UpdateModule } from "./update_module";

type Props = {
  isGlobalAdmin: boolean;
};

export function ProjectModules(p: Props) {
  const projectDetail = useProjectDetail();
  const { openEditor, EditorWrapper } = getEditorWrapper();

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar heading={t2(T.FRENCH_UI_STRINGS.modules)}
            class="border-base-300" ensureHeightAsIfButton></HeadingBar>
        }
      >
        <div class="ui-pad ui-spy">
          <For each={_POSSIBLE_MODULES}>
            {(possibleModuleDef) => {
              const installedModule = projectDetail.projectModules.find(
                (m) => m.id === possibleModuleDef.id,
              );
              return (
                <Switch>
                  <Match when={installedModule} keyed>
                    {(keyedInstalledModule) => {
                      return (
                        <InstalledModulePresentation
                          projectDetail={projectDetail}
                          projectId={projectDetail.id}
                          isGlobalAdmin={p.isGlobalAdmin}
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
        text: "There are no settings for this module!",
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
    for (const otherMod of _POSSIBLE_MODULES) {
      if (otherMod.prerequisiteModules.includes(p.thisInstalledModule.id)) {
        if (p.allInstalledModules.some((m) => m.id === otherMod.id)) {
          return {
            success: false,
            err: `${t2(T.FRENCH_UI_STRINGS.in_order_to_disable_this_modul)} ${otherMod.label}`,
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
          <Button onClick={showScript} outline>
            {t("Script")}
          </Button>
          <Button onClick={showLogs} outline>
            {t2(T.FRENCH_UI_STRINGS.logs)}
          </Button>
        </Show>
        <Show
          when={pds.moduleDirtyStates[p.thisInstalledModule.id] === "ready"}
        >
          <Button onClick={showFiles} outline>
            {t2(T.Modules.files)}
          </Button>
        </Show>
        <Show when={p.isGlobalAdmin}>
          <Show when={!p.projectDetail.isLocked}>
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
                {t2(T.FRENCH_UI_STRINGS.rerun)}
              </Button>
            </Show>
            <Button
              onClick={disableModule.click}
              state={disableModule.state()}
              outline
            >
              {t2(T.FRENCH_UI_STRINGS.disable)}
            </Button>
            <Button onClick={updateModule} iconName="refresh">
              {t2(T.Modules.update)}
            </Button>
          </Show>
          <Button onClick={editSettings} iconName="settings">
            {t2(T.FRENCH_UI_STRINGS.settings)}
          </Button>
          {/* </div> */}
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
            Waiting for data or upstream modules
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
                    {t2("Last module install/update")}:{" "}
                    {new Date(
                      p.thisInstalledModule.dateInstalled,
                    ).toLocaleString()}
                    {" "}{p.thisInstalledModule.commitSha ? (
                      <span>
                        (Commit: {p.thisInstalledModule.commitSha.slice(0, 6)})
                      </span>
                    ) : "No SHA"}
                  </div>
                  <div class="text-success text-xs">
                    {t2(T.FRENCH_UI_STRINGS.last_run)}:{" "}
                    {new Date(
                      pds.moduleLastRun[p.thisInstalledModule.id],
                    ).toLocaleString()}
                    {" "}{p.thisInstalledModule.latestRanCommitSha ? (
                      <span>
                        (Latest run commit: {p.thisInstalledModule.latestRanCommitSha.slice(0, 6)})
                      </span>
                    ) : "No SHA"}
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
                View logs to determine the error
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
          _POSSIBLE_MODULES.find((m) => m.id === prereq)?.label ?? prereq;
        return {
          success: false,
          err: `${t("In order to install this module you must first install the module")} ${missingModLabel}`,
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
        when={!p.projectDetail.isLocked && p.isGlobalAdmin}
        fallback={
          <div class="font-400 text-neutral text-sm">{t("Deactivated")}</div>
        }
      >
        <div class="">
          <Button
            onClick={enableModule.click}
            state={enableModule.state()}
            outline
          >
            {t2(T.FRENCH_UI_STRINGS.enable)}
          </Button>
        </div>
      </Show>
    </div>
  );
}
