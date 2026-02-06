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
  ReportIcon,
  SettingsIcon,
  SparklesIcon,
  StateHolderWrapper,
  TimQuery,
  getEditorWrapper,
} from "panther";
import { createEffect, Match, Show, Switch } from "solid-js";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import { ProjectRunnerProvider, useProjectDetail } from "~/components/project_runner/mod";

import { ProjectData } from "./project_data";
import { ProjectDecks } from "./project_decks";
import { ProjectMetrics } from "./project_metrics";
import { ProjectModules } from "./project_modules";
import { ProjectReports } from "./project_reports";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
// import { ProjectWhiteboard } from "../project_whiteboard";
import { projectTab, updateProjectView, showAi, setShowAi } from "~/state/ui";
import type { TabOption } from "~/state/ui";
import { AIProjectWrapper, useAIProjectContext } from "../project_ai";

type Props = {
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
  projectId: string;
};

function AIContextSync() {
  const { setAIContext } = useAIProjectContext();

  createEffect(() => {
    const tab = projectTab();
    console.log("[AIContextSync] Tab changed:", tab);
    switch (tab) {
      case "visualizations":
        setAIContext({ mode: "viewing_visualizations" });
        break;
      case "decks":
        setAIContext({ mode: "viewing_slide_decks" });
        break;
      case "reports":
        setAIContext({ mode: "viewing_reports" });
        break;
      case "data":
        setAIContext({ mode: "viewing_data" });
        break;
      case "metrics":
        setAIContext({ mode: "viewing_metrics" });
        break;
      case "modules":
        setAIContext({ mode: "viewing_modules" });
        break;
      case "settings":
      case "whiteboard":
        setAIContext({ mode: "viewing_visualizations" });
        break;
    }
  });

  return null;
}

export default function Project(p: Props) {
  // Utils

  const navigate = useNavigate();

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
            <AIProjectWrapper instanceDetail={keyedInstanceDetail}>
              <AIContextSync />
              <ProjectEditorWrapper>
                <FrameTop
                  panelChildren={
                    <div class="ui-gap ui-pad bg-base-content border-b border-base-content text-base-100 flex h-full w-full items-center">
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
                        <Show when={!showAi()}>
                          <Button
                            onClick={() => setShowAi(true)}
                            iconName="chevronLeft"
                            intent="base-100"
                            outline
                          >
                            {t("AI")}
                          </Button>
                        </Show>
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
                        onClick={() => updateProjectView({ tab: "whiteboard" })}
                        data-selected={projectTab() === "whiteboard"}
                      >
                        <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                          <PencilIcon />
                        </span>
                        {t2("Whiteboard")}
                      </div> */}
                        <div
                          class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                          onClick={() => updateProjectView({ tab: "decks" })}
                          data-selected={projectTab() === "decks"}
                        >
                          <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                            <SparklesIcon />
                          </span>
                          Slide decks
                        </div>
                        <div
                          class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                          onClick={() => updateProjectView({ tab: "reports" })}
                          data-selected={projectTab() === "reports"}
                        >
                          <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                            <ReportIcon />
                          </span>
                          {t2(T.FRENCH_UI_STRINGS.reports)}
                        </div>
                        <div
                          class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                          onClick={() => updateProjectView({ tab: "visualizations" })}
                          data-selected={projectTab() === "visualizations"}
                        >
                          <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                            <ChartIcon />
                          </span>
                          {t2(T.FRENCH_UI_STRINGS.visualizations)}
                        </div>
                        <div
                          class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                          onClick={() => updateProjectView({ tab: "metrics" })}
                          data-selected={projectTab() === "metrics"}
                        >
                          <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                            <BadgeIcon />
                          </span>
                          {t2("Metrics")}
                        </div>
                        <Show when={p.isGlobalAdmin}>
                          <div
                            class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                            onClick={() => updateProjectView({ tab: "modules" })}
                            data-selected={projectTab() === "modules"}
                          >
                            <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                              <CodeIcon />
                            </span>
                            {t2(T.FRENCH_UI_STRINGS.modules)}
                          </div>
                          <div
                            class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                            onClick={() => updateProjectView({ tab: "data" })}
                            data-selected={projectTab() === "data"}
                          >
                            <span class="text-primary h-[1.25em] w-[1.25em] flex-none">
                              <DatabaseIcon />
                            </span>
                            {t2(T.FRENCH_UI_STRINGS.data)}
                          </div>
                          <div
                            class="ui-hoverable data-[selected=true]:border-primary data-[selected=true]:bg-base-200 flex items-center gap-[0.75em] border-l-4 py-4 pl-6 pr-8 data-[selected=false]:border-transparent data-[selected=false]:hover:border-0 data-[selected=false]:hover:pl-7"
                            onClick={() => updateProjectView({ tab: "settings" })}
                            data-selected={projectTab() === "settings"}
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
                      {/* <Match when={projectTab() === "whiteboard"}>
                        <ProjectWhiteboard
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match> */}
                      <Match when={projectTab() === "reports"}>
                        <ProjectReports
                          instanceDetail={keyedInstanceDetail}
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "decks"}>
                        <ProjectDecks
                          instanceDetail={keyedInstanceDetail}
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "visualizations"}>
                        <ProjectVisualizations
                          isGlobalAdmin={p.isGlobalAdmin}
                          instanceDetail={keyedInstanceDetail}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "metrics"}>
                        <ProjectMetrics
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match>
                      <Match when={projectTab() === "modules"}>
                        <ProjectModules
                          isGlobalAdmin={p.isGlobalAdmin}
                        />
                      </Match>
                      <Match when={projectTab() === "data"}>
                        <ProjectData
                          isGlobalAdmin={p.isGlobalAdmin}
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match>
                      <Match
                        when={projectTab() === "settings" && p.isGlobalAdmin}
                      >
                        <ProjectSettings
                          isGlobalAdmin={p.isGlobalAdmin}
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
            </AIProjectWrapper>
          );
        }}
      </StateHolderWrapper>
    </ProjectRunnerProvider>
  );
}
