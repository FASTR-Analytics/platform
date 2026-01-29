import { useNavigate, useSearchParams } from "@solidjs/router";
import { InstanceDetail, PresentationObjectSummary, T, t, t2 } from "lib";
import { getPODetailFromCacheorFetch } from "~/state/po_cache";
import {
  BadgeIcon,
  Button,
  ChartIcon,
  CodeIcon,
  DatabaseIcon,
  FrameLeft,
  FrameTop,
  PencilIcon,
  ReportIcon,
  SettingsIcon,
  SparklesIcon,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
  getFirstString,
  openAlert,
  timQuery,
} from "panther";
import { Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import { ProjectRunnerProvider, useProjectDirtyStates } from "~/components/project_runner/mod";
import { serverActions } from "~/server_actions";
// import { ProjectChatbotV3 as ProjectChatbot } from "../project_chatbot_v3";
import { Report } from "../report";
import { VisualizationEditor } from "../visualization";
import { ProjectData } from "./project_data";
import { ProjectDecks } from "./project_decks";
import { ProjectMetrics } from "./project_metrics";
import { ProjectModules } from "./project_modules";
import { ProjectReports } from "./project_reports";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
import { ProjectAiSlideDeck } from "../project_ai_slide_deck";
import { ProjectWhiteboard } from "../project_whiteboard";
import { setVizGroupingMode, setVizSelectedGroup } from "~/state/ui";

type TabOption =
  | "chatbot"
  | "whiteboard"
  | "reports"
  | "decks"
  | "visualizations"
  | "metrics"
  | "modules"
  | "data"
  | "settings";

type Props = {
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
  projectId: string;
};

export default function Project(p: Props) {
  // Utils

  const [searchParams, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const [tab, setTab] = createSignal<TabOption>("whiteboard");

  function changeTab(tab: TabOption) {
    setSearchParams({ r: undefined, d: undefined });
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

  async function openVisualizationEditor(
    po: PresentationObjectSummary,
    projectDetail: any,
    instanceDetail: any,
  ) {
    if (po.isDefault) {
      const poDetailRes = await getPODetailFromCacheorFetch(
        projectDetail.id,
        po.id,
      );
      if (poDetailRes.success === false) {
        await openAlert({
          text: "Failed to load visualization",
          intent: "danger",
        });
        return;
      }

      const result = await openProjectEditor({
        element: VisualizationEditor,
        props: {
          mode: "create" as const,
          projectId: projectDetail.id,
          label: `Copy of ${poDetailRes.data.label}`,
          resultsValue: poDetailRes.data.resultsValue,
          config: structuredClone(poDetailRes.data.config),
          instanceDetail,
          projectDetail,
          isGlobalAdmin: p.isGlobalAdmin,
        },
      });

      if (result?.created) {
        await projectDetail.fetch();
        setTab("visualizations");
        setVizGroupingMode("folders");
        setVizSelectedGroup(
          result.created.folderId === null
            ? "_unfiled"
            : result.created.folderId,
        );
      }
      return;
    }

    const result = await openProjectEditor({
      element: VisualizationEditor,
      props: {
        mode: "edit" as const,
        projectId: projectDetail.id,
        presentationObjectId: po.id,
        instanceDetail,
        projectDetail,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });

    if (result?.deleted) {
      await projectDetail.fetch();
    } else if (result?.saved) {
      await projectDetail.silentFetch();
    }
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

                return (
                  <Switch>
                    <Match when={getFirstString(searchParams.r)}>
                      <Report
                        isGlobalAdmin={p.isGlobalAdmin}
                        projectDetail={keyedProjectDetail}
                        reportId={getFirstString(searchParams.r)!}
                        backToProject={backToProject}
                        instanceDetail={keyedInstanceDetail}
                      />
                    </Match>
                    <Match when={getFirstString(searchParams.d)}>
                      <ProjectAiSlideDeck
                        instanceDetail={keyedInstanceDetail}
                        projectDetail={keyedProjectDetail}
                        deckId={getFirstString(searchParams.d)!}
                        reportLabel={keyedProjectDetail.slideDecks.find(d => d.id === getFirstString(searchParams.d))?.label || "Slide Deck"}
                        backToProject={backToProject}
                      />
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
                                {/* <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("chatbot")}
                                  data-selected={tab() === "chatbot"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <SparklesIcon />
                                  </span>
                                  {t2("AI Assistant")}
                                </div> */}
                                <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("whiteboard")}
                                  data-selected={tab() === "whiteboard"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <PencilIcon />
                                  </span>
                                  {t2("Whiteboard")}
                                </div>
                                {/* <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("reports")}
                                  data-selected={tab() === "reports"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <ReportIcon />
                                  </span>
                                  {t2(T.FRENCH_UI_STRINGS.reports)}
                                </div> */}
                                <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("decks")}
                                  data-selected={tab() === "decks"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <SparklesIcon />
                                  </span>
                                  Slide decks
                                </div>
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
                                <div
                                  class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                                  onClick={() => changeTab("metrics")}
                                  data-selected={tab() === "metrics"}
                                >
                                  <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                                    <BadgeIcon />
                                  </span>
                                  {t2("Metrics")}
                                </div>
                                <Show when={p.isGlobalAdmin}>
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
                              </div>
                            }
                          >
                            <Switch>
                              {/* <Match when={tab() === "chatbot"}>
                                <ProjectChatbot
                                  instanceDetail={keyedInstanceDetail}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match> */}
                              <Match when={tab() === "whiteboard"}>
                                <ProjectWhiteboard
                                  instanceDetail={keyedInstanceDetail}
                                  projectDetail={keyedProjectDetail}
                                />
                              </Match>
                              <Match when={tab() === "reports"}>
                                <ProjectReports
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match>
                              <Match when={tab() === "decks"}>
                                <ProjectDecks
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                />
                              </Match>
                              <Match when={tab() === "visualizations"}>
                                <ProjectVisualizations
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  instanceDetail={keyedInstanceDetail}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                  openProjectEditor={openProjectEditor}
                                  openVisualizationEditor={openVisualizationEditor}
                                />
                              </Match>
                              <Match when={tab() === "metrics"}>
                                <ProjectMetrics
                                  projectDetail={keyedProjectDetail}
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  openProjectEditor={openProjectEditor}
                                  instanceDetail={keyedInstanceDetail}
                                />
                              </Match>
                              <Match when={tab() === "modules"}>
                                <ProjectModules
                                  isGlobalAdmin={p.isGlobalAdmin}
                                  projectDetail={keyedProjectDetail}
                                  attemptGetProjectDetail={projectDetail.fetch}
                                  silentRefreshProject={
                                    projectDetail.silentFetch
                                  }
                                />
                              </Match>
                              <Match when={tab() === "data"}>
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
                                when={tab() === "settings" && p.isGlobalAdmin}
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
