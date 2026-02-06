import { useNavigate, useSearchParams } from "@solidjs/router";
import { InstanceDetail, t2, T } from "lib";
import { UserLog } from "../../../../server/db/mod.ts";
import {
  Button,
  ChartIcon,
  CodeIcon,
  DatabaseIcon,
  FolderIcon,
  FrameLeft,
  FrameTop,
  ReportIcon,
  SettingsIcon,
  SparklesIcon,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
  timQuery,
} from "panther";
import { Match, Show, Switch, Suspense, createEffect, createSignal, createResource } from "solid-js";
import { ProjectRunnerProvider } from "~/components/project_runner/mod";
// import { PresentationObjectEditor } from "~/components/forms_editors/presentation_object_editor";
// import { Module } from "~/components/module";
import { t } from "lib";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import { useProjectDirtyStates } from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
import { Report } from "../report";
import { Visualization } from "../visualization";
import { ProjectData } from "./project_data";
import { ProjectModules } from "./project_modules";
import { ProjectReports } from "./project_reports";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
import { ProjectChatbotV3 as ProjectChatbot } from "../project_chatbot_v3";
import { ProjectLogs } from "./project_logs.tsx";

type TabOption =
  | "chatbot"
  | "reports"
  | "visualizations"
  | "modules"
  | "data"
  | "settings"
  | "logs";

type Props = {
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
  projectId: string;
};

export default function Project(p: Props) {
  // Utils

  const [searchParams, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const [tab, setTab] = createSignal<TabOption>("visualizations");

  function changeTab(tab: TabOption) {
    setSearchParams({ b: undefined, d: undefined });
    setTab(tab);
  }

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  // Query state

  const projectDetail = timQuery(
    () => serverActions.getProjectDetail({ projectId: p.projectId }),
    t2(T.FRENCH_UI_STRINGS.loading_project_details),
  );

  // Back funcs

  async function backToProject(withUpdate: boolean) {
    if (withUpdate) {
      projectDetail.fetch();
    }
    navigate(`/?p=${p.projectId}`);
  }

  return (
    <ProjectRunnerProvider projectId={p.projectId}>
      <StateHolderWrapper
        state={p.instanceDetail.state()}
        onErrorButton={{ label: t("Go home"), link: "/" }}
      >
        {(keyedInstanceDetail) => {
          return (
            <StateHolderWrapper
              state={projectDetail.state()}
              onErrorButton={{ label: t("Go home"), link: "/" }}
            >
              {(keyedProjectDetail) => {
                const pds = useProjectDirtyStates();
                let firstRun = true;
                createEffect(() => {
                  const _v = pds.projectLastUpdated;
                  if (firstRun) {
                    firstRun = false;
                    return;
                  }
                  projectDetail.silentFetch();
                });

                // Project logs state
                const [projectLogs] = createResource(
                  () => serverActions.getProjectLogs({ projectId: p.projectId })
                );
                const [logFilterUser, setLogFilterUser] = createSignal<string | undefined>(undefined);

                return (
                  <Switch>
                    <Match when={searchParams.r}>
                      <Report
                        isGlobalAdmin={p.isGlobalAdmin}
                        projectDetail={keyedProjectDetail}
                        reportId={searchParams.r!}
                        backToProject={backToProject}
                        instanceDetail={keyedInstanceDetail}
                      />
                    </Match>
                    <Match when={searchParams.v}>
                      <Show
                        when={searchParams.m}
                        fallback="No module ID in url"
                      >
                        <Visualization
                          isGlobalAdmin={p.isGlobalAdmin}
                          projectDetail={keyedProjectDetail}
                          moduleId={searchParams.m!}
                          presentationObjectId={searchParams.v!}
                          backToProject={backToProject}
                        />
                      </Show>
                    </Match>
                    <Match when={true}>
                      <ProjectEditorWrapper>
                        <FrameTop
                          panelChildren={
                            <div class="ui-gap ui-pad bg-base-content text-base-100 flex h-full w-full items-center">
                              <Button
                                iconName="chevronLeft"
                                onClick={() => navigate("/")}
                              />
                              <div class="font-700 flex-1 truncate text-xl">
                                <span class="font-400">
                                  {keyedProjectDetail.label}
                                </span>
                              </div>
                              <div class="ui-gap-sm flex items-center">
                                <ProjectRunStatus />
                              </div>
                            </div>
                          }
                        >
                          <FrameLeft
                            panelChildren={
                              <div class="font-700 h-full border-r text-sm">
                                <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("chatbot")}
                                  data-selected={tab() === "chatbot"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <SparklesIcon />
                                  </span>
                                  {t2("AI Assistant")}
                                </div>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_reports || keyedProjectDetail.thisUserPermissions.can_view_reports}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("reports")}
                                    data-selected={tab() === "reports"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <ReportIcon />
                                    </span>
                                    {t2(T.FRENCH_UI_STRINGS.reports)}
                                  </div>
                                </Show>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_visualizations || keyedProjectDetail.thisUserPermissions.can_view_visualizations}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("visualizations")}
                                    data-selected={tab() === "visualizations"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <ChartIcon />
                                    </span>
                                    {t2(T.FRENCH_UI_STRINGS.visualizations)}
                                  </div>
                                </Show>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_modules || keyedProjectDetail.thisUserPermissions.can_run_modules}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("modules")}
                                    data-selected={tab() === "modules"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <CodeIcon />
                                    </span>
                                    {t2(T.FRENCH_UI_STRINGS.modules)}
                                  </div>
                                </Show>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_view_data || keyedProjectDetail.thisUserPermissions.can_configure_data}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("data")}
                                    data-selected={tab() === "data"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <DatabaseIcon />
                                    </span>
                                    {t2(T.FRENCH_UI_STRINGS.data)}
                                  </div>
                                </Show>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_settings}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("settings")}
                                    data-selected={tab() === "settings"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <SettingsIcon />
                                    </span>
                                    {t2(T.FRENCH_UI_STRINGS.settings)}
                                  </div>
                                </Show>
                                <Show when={p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_view_logs}>
                                  <div
                                    class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                    onClick={() => changeTab("logs")}
                                    data-selected={tab() === "logs"}
                                  >
                                    <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                      <ChartIcon />
                                    </span>
                                    {t("Logs")}
                                  </div>
                                </Show>          
                              </div>
                            }
                          >
                            <Switch>
                              <Match when={tab() === "chatbot"}>
                                <ProjectChatbot
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match>
                              <Match when={tab() === "reports" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_reports || keyedProjectDetail.thisUserPermissions.can_view_reports)}>
                                <ProjectReports
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match>
                              <Match when={tab() === "visualizations" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_visualizations || keyedProjectDetail.thisUserPermissions.can_view_visualizations)}>
                                <ProjectVisualizations
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match>
                              <Match when={tab() === "modules" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_modules || keyedProjectDetail.thisUserPermissions.can_run_modules)}>
                                <ProjectModules
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  canConfigureModules={keyedProjectDetail.thisUserPermissions.can_configure_modules}
                                  canRunModules={keyedProjectDetail.thisUserPermissions.can_run_modules}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                />
                              </Match>
                              <Match when={tab() === "data" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_view_data || keyedProjectDetail.thisUserPermissions.can_configure_data)}>
                                <ProjectData
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  instanceDetail={keyedInstanceDetail}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                />
                              </Match>
                              <Match
                                when={tab() === "settings" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_configure_settings)}
                              >
                                <ProjectSettings
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  projectDetail={keyedProjectDetail}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  silentRefreshInstance={
                                    p.instanceDetail.silentFetch
                                  }
                                  backToHome={() => navigate("/")}
                                  instanceDetail={keyedInstanceDetail}
                                />
                              </Match>
                              <Match
                                when={tab() === "logs" && (p.isGlobalAdmin || keyedProjectDetail.thisUserPermissions.can_view_logs)}
                              >
                                <Suspense fallback={<div class="text-neutral text-sm">Loading logs...</div>}>
                                  <Show
                                    when={Array.isArray(projectLogs())}
                                    fallback={<div class="text-neutral text-sm">{t("No logs available")}</div>}
                                  >
                                    <ProjectLogs
                                      logs={projectLogs() as UserLog[]}
                                      filterByUser={logFilterUser()}
                                      onFilterByUser={setLogFilterUser}
                                    />
                                  </Show>
                                </Suspense>
                              </Match>
                            </Switch>
                          </FrameLeft>
                        </FrameTop>
                      </ProjectEditorWrapper>
                    </Match>
                  </Switch>
                );
              }}
            </StateHolderWrapper>
          );
        }}
      </StateHolderWrapper>
    </ProjectRunnerProvider>
  );
}
