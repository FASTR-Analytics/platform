import { useNavigate } from "@solidjs/router";
import { InstanceDetail, T, t, t2 } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  StateHolderWrapper,
  TabsNavigation,
  TimQuery,
  getEditorWrapper,
  getTabs,
} from "panther";
import { createEffect, Match, Show, Switch } from "solid-js";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import {
  ProjectRunnerProvider,
  useProjectDetail,
} from "~/components/project_runner/mod";

import { ProjectData } from "./project_data";
import { ProjectDecks } from "./project_decks";
import { ProjectMetrics } from "./project_metrics";
import { ProjectModules } from "./project_modules";
import { ProjectReports } from "./project_reports";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
import {
  projectTab,
  updateProjectView,
  showAi,
  setShowAi,
  navCollapsed,
  setNavCollapsed,
} from "~/state/ui";
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
      // case "reports":
      //   setAIContext({ mode: "viewing_reports" });
      //   break;
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
        setAIContext({ mode: "viewing_settings" });
        break;
    }
  });

  return null;
}

export default function Project(p: Props) {
  return (
    <ProjectRunnerProvider projectId={p.projectId}>
      <StateHolderWrapper
        state={p.instanceDetail.state()}
        onErrorButton={{ label: t("Go home"), link: "/" }}
      >
        {(keyedInstanceDetail) => {
          const projectDetail = useProjectDetail();

          // Utils

          const navigate = useNavigate();

          const {
            openEditor: openProjectEditor,
            EditorWrapper: ProjectEditorWrapper,
          } = getEditorWrapper();

          const allTabs = [
            ...(projectDetail.thisUserPermissions.can_view_slide_decks ? [{ value: "decks" as const, label: "Slide decks" }] : []),
            ...(projectDetail.thisUserPermissions.can_view_reports ? [{ value: "reports" as const, label: t2(T.FRENCH_UI_STRINGS.reports) }] : []),
            ...(projectDetail.thisUserPermissions.can_view_visualizations ? [{ value: "visualizations" as const, label: t2(T.FRENCH_UI_STRINGS.visualizations) }] : []),
            ...(projectDetail.thisUserPermissions.can_view_metrics ? [{ value: "metrics" as const, label: t2("Metrics") }] : []),
            ...(projectDetail.thisUserPermissions.can_configure_modules || projectDetail.thisUserPermissions.can_run_modules ? [{ value: "modules" as const, label: t2(T.FRENCH_UI_STRINGS.modules) }] : []),
            ...(projectDetail.thisUserPermissions.can_view_data ? [{ value: "data" as const, label: t2(T.FRENCH_UI_STRINGS.data) }] : []),
            ...(projectDetail.thisUserPermissions.can_configure_settings ? [{ value: "settings" as const, label: t2(T.FRENCH_UI_STRINGS.settings) }] : []),
          ];

          // Create tabs controller
          const tabs = getTabs(allTabs, {
            initialTab: projectTab(),
            onTabChange: (tab) => updateProjectView({ tab: tab as TabOption }),
          });

          // Icon mapping
          const tabIcons = {
            decks: "sparkles" as const,
            reports: "report" as const,
            visualizations: "chart" as const,
            metrics: "badge" as const,
            modules: "code" as const,
            data: "database" as const,
            settings: "settings" as const,
          };

          return (
            <AIProjectWrapper instanceDetail={keyedInstanceDetail}>
              <AIContextSync />
              <ProjectEditorWrapper>
                <FrameTop
                  panelChildren={
                    <div class="ui-gap ui-pad bg-base-content border-base-content text-base-100 flex h-full w-full items-center border-b">
                      <Button
                        iconName="chevronLeft"
                        onClick={() => navigate("/")}
                      />
                      <div class="font-700 flex-1 truncate text-xl">
                        <span class="font-400">{projectDetail.label}</span>
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
                      <div class="h-full border-r">
                        <TabsNavigation
                          tabs={tabs}
                          vertical
                          collapsible
                          collapsed={navCollapsed()}
                          onCollapsedChange={setNavCollapsed}
                          icons={tabIcons}
                        />
                      </div>
                    }
                  >
                    <Switch>
                      {/* <Match when={projectTab() === "whiteboard"}>
                        <ProjectWhiteboard
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match> */}
                      <Match when={projectTab() === "reports" && (projectDetail.thisUserPermissions.can_view_reports)}>
                        <ProjectReports
                          instanceDetail={keyedInstanceDetail}
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "decks" && (projectDetail.thisUserPermissions.can_view_slide_decks)}>
                        <ProjectDecks
                          instanceDetail={keyedInstanceDetail}
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "visualizations" && (projectDetail.thisUserPermissions.can_view_visualizations)}>
                        <ProjectVisualizations
                          isGlobalAdmin={p.isGlobalAdmin}
                          instanceDetail={keyedInstanceDetail}
                          openProjectEditor={openProjectEditor}
                        />
                      </Match>
                      <Match when={projectTab() === "metrics" && (projectDetail.thisUserPermissions.can_view_metrics)}>
                        <ProjectMetrics
                          isGlobalAdmin={p.isGlobalAdmin}
                          openProjectEditor={openProjectEditor}
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match>
                      <Match when={projectTab() === "modules" && (projectDetail.thisUserPermissions.can_configure_modules || projectDetail.thisUserPermissions.can_run_modules)}>
                        <ProjectModules
                          isGlobalAdmin={p.isGlobalAdmin}
                          canConfigureModules={
                            projectDetail.thisUserPermissions
                              .can_configure_modules
                          }
                          canRunModules={
                            projectDetail.thisUserPermissions.can_run_modules
                          }
                        />
                      </Match>
                      <Match when={projectTab() === "data" && (projectDetail.thisUserPermissions.can_view_data)}>
                        <ProjectData
                          isGlobalAdmin={p.isGlobalAdmin}
                          instanceDetail={keyedInstanceDetail}
                        />
                      </Match>
                      <Match
                        when={projectTab() === "settings" && (projectDetail.thisUserPermissions.can_configure_settings)}
                      >
                        <ProjectSettings
                          isGlobalAdmin={p.isGlobalAdmin}
                          silentRefreshInstance={p.instanceDetail.silentFetch}
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
