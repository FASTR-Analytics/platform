import { useNavigate } from "@solidjs/router";
import { _DEV_USERS, t3, TC } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  TabsNavigation,
  getEditorWrapper,
  openComponent,
  type ListItem,
} from "panther";
import { FeedbackForm } from "~/components/instance/feedback_form";
import { createEffect, Match, Show, Switch } from "solid-js";
import { ProjectSSEBoundary } from "~/state/project/t1_sse";
import { projectState } from "~/state/project/t1_store";

import { ProjectDecks } from "./project_decks";
import { ProjectReports } from "./project_reports";
import { ProjectDashboards } from "./project_dashboards";
import { ProjectMetrics } from "./project_metrics";
import { ProjectResultsPackage } from "./project_results_package";
import { ProjectSettings } from "./project_settings";
import { ProjectVisualizations } from "./project_visualizations";
import { ProjectCache } from "./project_cache";
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
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  projectId: string;
};

function AIContextSync() {
  const { setAIContext } = useAIProjectContext();

  createEffect(() => {
    const tab = projectTab();
    switch (tab) {
      case "visualizations":
        setAIContext({ mode: "viewing_visualizations" });
        break;
      case "reports":
        setAIContext({ mode: "viewing_reports" });
        break;
      case "decks":
        setAIContext({ mode: "viewing_slide_decks" });
        break;
      case "metrics":
        setAIContext({ mode: "viewing_metrics" });
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
    <ProjectSSEBoundary projectId={p.projectId}>
      <ProjectInner />
    </ProjectSSEBoundary>
  );
}

function ProjectInner() {
  const navigate = useNavigate();

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  const tabItems = (): ListItem<TabOption>[] => {
    const perms = projectState.thisUserPermissions;
    const items: ListItem<TabOption>[] = [];
    if (perms.can_view_reports) {
      items.push({
        id: "reports",
        label: t3({ en: "Reports", fr: "Rapports", pt: "Relatórios" }),
        iconName: "report",
      });
    }
    if (perms.can_view_slide_decks) {
      items.push({
        id: "decks",
        label: t3({ en: "Slide decks", fr: "Présentations", pt: "Apresentações" }),
        iconName: "presentation",
      });
      items.push({
        id: "dashboards",
        label: t3({ en: "Dashboards", fr: "Tableaux de bord", pt: "Painéis" }),
        iconName: "layoutDashboard",
      });
    }
    if (perms.can_view_visualizations) {
      items.push({
        id: "visualizations",
        label: t3({ en: "Visualizations", fr: "Visualisations", pt: "Visualizações" }),
        iconName: "chart",
      });
    }
    // Instance-admin surface: results-package generation gating
    // (PLAN_RESULTS_RUNS item 2 — matches the server's can_configure_data
    // guard, which global admins bypass).
    if (
      instanceState.currentUserIsGlobalAdmin ||
      instanceState.currentUserPermissions.can_configure_data
    ) {
      items.push({
        id: "results_package",
        label: t3({
          en: "Results package",
          fr: "Paquet de résultats",
          pt: "Pacote de resultados",
        }),
        iconName: "package",
      });
    }
    if (perms.can_configure_settings) {
      items.push({
        id: "settings",
        label: t3(TC.settings),
        iconName: "settings",
      });
    }
    if (_DEV_USERS.includes(instanceState.currentUserEmail)) {
      items.push({
        id: "cache",
        label: t3({ en: "Cache", fr: "Cache", pt: "Cache" }),
        iconName: "database",
      });
    }
    return items;
  };

  return (
    <AIProjectWrapper>
      <AIContextSync />
      <ProjectEditorWrapper>
        <Show
          when={tabItems().length > 0}
          fallback={
            <div class="ui-pad text-danger">
              {t3({
                en: "No accessible tabs for this project.",
                fr: "Aucun onglet accessible pour ce projet.",
                pt: "Nenhum separador acessível para este projeto.",
              })}
            </div>
          }
        >
          <FrameTop
            panelChildren={
              <div class="ui-gap ui-pad bg-base-content border-base-content text-base-100 flex h-full w-full items-center border-b">
                <Button iconName="chevronLeft" onClick={() => navigate("/")} />
                <div class="font-700 flex-1 truncate text-xl">
                  <span class="font-400">{projectState.label}</span>
                </div>
                <div class="ui-gap-sm flex items-center">
                  <Button
                    onClick={() =>
                      openComponent({
                        element: FeedbackForm,
                        props: {
                          projectLabel: projectState.label,
                        },
                      })
                    }
                    intent="base-100"
                    outline
                  >
                    {t3({
                      en: "Send feedback",
                      fr: "Envoyer un commentaire",
                      pt: "Enviar comentários",
                    })}
                  </Button>
                  <Show when={!showAi()}>
                    <Button
                      onClick={() => setShowAi(true)}
                      iconName="chevronLeft"
                      intent="base-100"
                      outline
                    >
                      {t3({ en: "AI", fr: "IA", pt: "IA" })}
                    </Button>
                  </Show>
                </div>
              </div>
            }
          >
            <FrameLeft
              panelChildren={
                <div class="h-full border-r">
                  <TabsNavigation
                    items={tabItems()}
                    value={projectTab()}
                    onChange={(tab) => updateProjectView({ tab })}
                    vertical
                    collapsible
                    collapsed={navCollapsed()}
                    onCollapsedChange={setNavCollapsed}
                  />
                </div>
              }
            >
              <Switch>
                <Match
                  when={
                    projectTab() === "reports" &&
                    projectState.thisUserPermissions.can_view_reports
                  }
                >
                  <ProjectReports openProjectEditor={openProjectEditor} />
                </Match>
                <Match
                  when={
                    projectTab() === "decks" &&
                    projectState.thisUserPermissions.can_view_slide_decks
                  }
                >
                  <ProjectDecks openProjectEditor={openProjectEditor} />
                </Match>
                <Match
                  when={
                    projectTab() === "dashboards" &&
                    projectState.thisUserPermissions.can_view_slide_decks
                  }
                >
                  <ProjectDashboards openProjectEditor={openProjectEditor} />
                </Match>
                <Match
                  when={
                    projectTab() === "visualizations" &&
                    projectState.thisUserPermissions.can_view_visualizations
                  }
                >
                  <ProjectVisualizations
                    openProjectEditor={openProjectEditor}
                  />
                </Match>
                <Match
                  when={
                    projectTab() === "metrics" &&
                    projectState.thisUserPermissions.can_view_metrics
                  }
                >
                  <ProjectMetrics openProjectEditor={openProjectEditor} />
                </Match>
                <Match
                  when={
                    projectTab() === "results_package" &&
                    (instanceState.currentUserIsGlobalAdmin ||
                      instanceState.currentUserPermissions.can_configure_data)
                  }
                >
                  <ProjectResultsPackage />
                </Match>
                <Match
                  when={
                    projectTab() === "settings" &&
                    projectState.thisUserPermissions.can_configure_settings
                  }
                >
                  <ProjectSettings backToHome={() => navigate("/")} />
                </Match>
                <Match
                  when={
                    projectTab() === "cache" &&
                    instanceState.currentUserIsGlobalAdmin
                  }
                >
                  <ProjectCache />
                </Match>
              </Switch>
            </FrameLeft>
          </FrameTop>
        </Show>
      </ProjectEditorWrapper>
    </AIProjectWrapper>
  );
}
