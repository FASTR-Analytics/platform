import { useNavigate } from "@solidjs/router";
import { InstanceDetail, T, t, t2 } from "lib";
import {
  BadgeIcon,
  Button,
  ChartIcon,
  CodeIcon,
  DatabaseIcon,
  FrameLeft,
  FrameTop,
  PencilIcon,
  SettingsIcon,
  SparklesIcon,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import { ProjectRunnerProvider, useProjectDetail } from "~/components/project_runner/mod";

import { ProjectData } from "./project_data";
import { ProjectDecks } from "./project_decks";
import { ProjectMetrics } from "./project_metrics";
import { ProjectModules } from "./project_modules";
import { ProjectReports } from "./project_reports";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
import { ProjectWhiteboard } from "../project_whiteboard";

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

  const navigate = useNavigate();

  const [tab, setTab] = createSignal<TabOption>("whiteboard");

  function changeTab(tab: TabOption) {
    setTab(tab);
  }

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  return (
    <ProjectRunnerProvider projectId={p.projectId}>
      <StateHolderWrapper
        state={p.instanceDetail.state()}
        onErrorButton={{ label: t("Go home"), link: "/" }}
      >
        {(keyedInstanceDetail) => {
          const projectDetail = useProjectDetail();

          return (
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
                        {projectDetail.label}
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
                    <Match when={tab() === "whiteboard"}>
                      <ProjectWhiteboard
                        instanceDetail={keyedInstanceDetail}
                        projectDetail={projectDetail}
                      />
                    </Match>
                    <Match when={tab() === "reports"}>
                      <ProjectReports
                        projectDetail={projectDetail}
                        instanceDetail={keyedInstanceDetail}
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match when={tab() === "decks"}>
                      <ProjectDecks
                        projectDetail={projectDetail}
                        instanceDetail={keyedInstanceDetail}
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match when={tab() === "visualizations"}>
                      <ProjectVisualizations
                        isGlobalAdmin={p.isGlobalAdmin}
                        instanceDetail={keyedInstanceDetail}
                        projectDetail={projectDetail}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match when={tab() === "metrics"}>
                      <ProjectMetrics
                        projectDetail={projectDetail}
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                        instanceDetail={keyedInstanceDetail}
                      />
                    </Match>
                    <Match when={tab() === "modules"}>
                      <ProjectModules
                        isGlobalAdmin={p.isGlobalAdmin}
                        projectDetail={projectDetail}
                      />
                    </Match>
                    <Match when={tab() === "data"}>
                      <ProjectData
                        isGlobalAdmin={p.isGlobalAdmin}
                        instanceDetail={keyedInstanceDetail}
                        projectDetail={projectDetail}
                      />
                    </Match>
                    <Match
                      when={tab() === "settings" && p.isGlobalAdmin}
                    >
                      <ProjectSettings
                        isGlobalAdmin={p.isGlobalAdmin}
                        projectDetail={projectDetail}
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
          );
        }}
      </StateHolderWrapper>
    </ProjectRunnerProvider>
  );
}
