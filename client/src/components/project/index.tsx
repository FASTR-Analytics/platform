import { useNavigate } from "@solidjs/router";
import { t3, TC } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  TabsNavigation,
  getEditorWrapper,
  getTabs,
  openComponent,
} from "panther";
import { FeedbackForm } from "~/components/instance/feedback_form";
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
} from "~/state/t4_ui";
import type { TabOption } from "~/state/t4_ui";
import { AIProjectWrapper, useAIProjectContext } from "../project_ai";

type Props = {
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
      <ProjectInner isGlobalAdmin={p.isGlobalAdmin} />
    </ProjectRunnerProvider>
  );
}

function ProjectInner(p: { isGlobalAdmin: boolean }) {
  const projectDetail = useProjectDetail();
  const navigate = useNavigate();

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  const allTabs = [
    ...(projectDetail.thisUserPermissions.can_view_slide_decks
      ? [
          {
            value: "decks" as const,
            label: t3({ en: "Slide decks", fr: "Présentations" }),
          },
        ]
      : []),
    ...(projectDetail.thisUserPermissions.can_view_visualizations
      ? [
          {
            value: "visualizations" as const,
            label: t3({ en: "Visualizations", fr: "Visualisations" }),
          },
        ]
      : []),
    // ...(projectDetail.thisUserPermissions.can_view_metrics
    //   ? [{ value: "metrics" as const, label: t3({ en: "Metrics", fr: "Indicateurs" }) }]
    //   : []),
    ...(projectDetail.thisUserPermissions.can_configure_modules ||
    projectDetail.thisUserPermissions.can_run_modules ||
    projectDetail.thisUserPermissions.can_view_script_code
      ? [
          {
            value: "modules" as const,
            label: t3({ en: "Modules", fr: "Modules" }),
          },
        ]
      : []),
    ...(projectDetail.thisUserPermissions.can_view_data
      ? [
          {
            value: "data" as const,
            label: t3({ en: "Data", fr: "Données" }),
          },
        ]
      : []),
    ...(projectDetail.thisUserPermissions.can_configure_settings
      ? [
          {
            value: "settings" as const,
            label: t3(TC.settings),
          },
        ]
      : []),
  ];

  return (
    <AIProjectWrapper>
      <AIContextSync />
      <ProjectEditorWrapper>
        <Show
          when={allTabs.length > 0}
          fallback={
            <div class="ui-pad text-danger">
              {t3({
                en: "No accessible tabs for this project.",
                fr: "Aucun onglet accessible pour ce projet.",
              })}
            </div>
          }
        >
          {(() => {
            const tabs = getTabs(allTabs, {
              initialTab: projectTab(),
              onTabChange: (tab) =>
                updateProjectView({ tab: tab as TabOption }),
            });

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
                      <Button
                        onClick={() =>
                          openComponent({
                            element: FeedbackForm,
                            props: {
                              projectLabel: projectDetail.label,
                            },
                          })
                        }
                        intent="base-100"
                        outline
                      >
                        {t3({
                          en: "Send feedback",
                          fr: "Envoyer un commentaire",
                        })}
                      </Button>
                      <Show when={!showAi()}>
                        <Button
                          onClick={() => setShowAi(true)}
                          iconName="chevronLeft"
                          intent="base-100"
                          outline
                        >
                          {t3({ en: "AI", fr: "IA" })}
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
                    <Match
                      when={
                        projectTab() === "reports" &&
                        projectDetail.thisUserPermissions.can_view_reports
                      }
                    >
                      <ProjectReports
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match
                      when={
                        projectTab() === "decks" &&
                        projectDetail.thisUserPermissions.can_view_slide_decks
                      }
                    >
                      <ProjectDecks
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match
                      when={
                        projectTab() === "visualizations" &&
                        projectDetail.thisUserPermissions
                          .can_view_visualizations
                      }
                    >
                      <ProjectVisualizations
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match
                      when={
                        projectTab() === "metrics" &&
                        projectDetail.thisUserPermissions.can_view_metrics
                      }
                    >
                      <ProjectMetrics
                        isGlobalAdmin={p.isGlobalAdmin}
                        openProjectEditor={openProjectEditor}
                      />
                    </Match>
                    <Match
                      when={
                        projectTab() === "modules" &&
                        (projectDetail.thisUserPermissions
                          .can_configure_modules ||
                          projectDetail.thisUserPermissions.can_run_modules ||
                          projectDetail.thisUserPermissions
                            .can_view_script_code)
                      }
                    >
                      <ProjectModules
                        isGlobalAdmin={p.isGlobalAdmin}
                        canConfigureModules={
                          projectDetail.thisUserPermissions
                            .can_configure_modules
                        }
                        canRunModules={
                          projectDetail.thisUserPermissions.can_run_modules
                        }
                        canViewScriptCode={
                          projectDetail.thisUserPermissions.can_view_script_code
                        }
                      />
                    </Match>
                    <Match
                      when={
                        projectTab() === "data" &&
                        projectDetail.thisUserPermissions.can_view_data
                      }
                    >
                      <ProjectData isGlobalAdmin={p.isGlobalAdmin} />
                    </Match>
                    <Match
                      when={
                        projectTab() === "settings" &&
                        projectDetail.thisUserPermissions.can_configure_settings
                      }
                    >
                      <ProjectSettings
                        isGlobalAdmin={p.isGlobalAdmin}
                        backToHome={() => navigate("/")}
                      />
                    </Match>
                  </Switch>
                </FrameLeft>
              </FrameTop>
            );
          })()}
        </Show>
      </ProjectEditorWrapper>
    </AIProjectWrapper>
  );
}
