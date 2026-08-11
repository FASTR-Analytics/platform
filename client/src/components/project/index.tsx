import { useNavigate } from "@solidjs/router";
import { _DEV_USERS, t3, TC } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  MenuTriggerWrapper,
  TabsNavigation,
  getEditorWrapper,
  openComponent,
  type ListItem,
  type MenuItem,
} from "panther";
import { FeedbackForm } from "~/components/instance/feedback_form";
import { createEffect, Match, Show, Switch } from "solid-js";
import { ProjectPageCursors } from "~/components/_shared/cursors/page_cursors";
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
  pendingTourReplay,
  setPendingTourReplay,
} from "~/state/t4_ui";
import type { TabOption } from "~/state/t4_ui";
import { AIProjectWrapper } from "../project_ai";
import {
  PROJECT_TAB_TO_VIEW,
  projectAIViewController,
} from "../project_ai/ai_views";
import { instanceState } from "~/state/instance/t1_store";
import {
  setupDashboardTours,
  setupDeckTours,
  setupReportTours,
  setupSettingsTours,
  setupVisualizationTours,
} from "~/onboarding";
import { TourCatalogueModal } from "~/onboarding/tour_catalogue_modal";
import { getTourCatalogue } from "~/onboarding/catalogue";

type Props = {
  projectId: string;
};

function AIContextSync() {
  createEffect(() => {
    projectAIViewController.setView(PROJECT_TAB_TO_VIEW[projectTab()]);
  });

  return null;
}

export default function Project(p: Props) {
  // The view controller is a module singleton but its interaction log is
  // project-scoped data: without this, a client-side project switch (the
  // keyed <Match> remounts us) delivers the previous project's retained
  // actions to this project's first digest as fake user activity.
  projectAIViewController.clearInteractionLog();
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

  // Destroyed with this component's reactive owner; the tour catalogue modal
  // gets them as props, so nothing outlives a project switch.
  const tourManagers = [
    setupDeckTours(),
    setupReportTours(),
    setupVisualizationTours(),
    setupDashboardTours(),
    setupSettingsTours(),
  ];

  // A replay requested from the instance-level catalogue. We only mount once
  // projectState has hydrated (ProjectSSEBoundary gates on isReady), so the
  // availability re-check is trustworthy; the instance modal already verified
  // it, making a silent skip on mismatch a race-only safety net.
  createEffect(() => {
    const tourId = pendingTourReplay();
    if (!tourId) return;
    setPendingTourReplay(null);
    const entry = getTourCatalogue().find((e) => e.id === tourId);
    if (!entry || !entry.available(projectState)) return;
    entry.navigate();
    void tourManagers.find((m) => m.hasTour(tourId))?.start(tourId);
  });

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
        label: t3({
          en: "Slide decks",
          fr: "Présentations",
          pt: "Apresentações",
        }),
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
        label: t3({
          en: "Visualizations",
          fr: "Visualisations",
          pt: "Visualizações",
        }),
        iconName: "chart",
      });
    }
    // The package this project serves from is the project's own data, so the
    // tab opens to any member who can view it (PLAN_RESULTS_RUNS Phase 3
    // item 4 — matching the server's can_view_data guard). The picker inside
    // is editor-gated separately; generation lives on the instance shell.
    if (perms.can_view_data) {
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
      {/* Page-level live cursors (renders into body portals; document-level
          listeners — placement here is inert). */}
      <ProjectPageCursors />
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
              <div
                class="ui-gap ui-pad bg-base-content border-base-content text-base-100 flex h-full w-full items-center border-b"
                data-cursor-zone="topbar"
              >
                <Button iconName="chevronLeft" onClick={() => navigate("/")} />
                <div class="font-700 flex-1 truncate text-xl">
                  <span class="font-400">{projectState.label}</span>
                </div>
                <div class="ui-gap-sm flex items-center">
                  <MenuTriggerWrapper
                    items={
                      [
                        {
                          label: t3({
                            en: "Guided tours",
                            fr: "Visites guidées",
                            pt: "Visitas guiadas",
                          }),
                          icon: "slideshow",
                          onClick: () =>
                            void openComponent({
                              element: TourCatalogueModal,
                              props: { managers: tourManagers },
                            }),
                        },
                        {
                          label: t3({
                            en: "Ask for help",
                            fr: "Demander de l'aide",
                            pt: "Pedir ajuda",
                          }),
                          icon: "lifebuoy",
                          onClick: () =>
                            void openComponent({
                              element: FeedbackForm,
                              props: {
                                projectLabel: projectState.label,
                                initialType: "help",
                              },
                            }),
                        },
                        {
                          label: t3({
                            en: "Send feedback",
                            fr: "Envoyer un commentaire",
                            pt: "Enviar comentários",
                          }),
                          icon: "pencil",
                          onClick: () =>
                            void openComponent({
                              element: FeedbackForm,
                              props: {
                                projectLabel: projectState.label,
                              },
                            }),
                        },
                        {
                          label: t3({
                            en: "Documentation",
                            fr: "Documentation",
                            pt: "Documentação",
                          }),
                          icon: "document",
                          onClick: () =>
                            window.open("https://fastr-analytics.org", "_blank"),
                        },
                      ] satisfies MenuItem[]
                    }
                    position="bottom-end"
                  >
                    <Button
                      intent="base-100"
                      outline
                      onBackground="base-content"
                    >
                      {t3({ en: "Help", fr: "Aide", pt: "Ajuda" })}
                    </Button>
                  </MenuTriggerWrapper>
                  <Show when={!showAi()}>
                    <Button
                      onClick={() => setShowAi(true)}
                      iconName="chevronLeft"
                      intent="base-100"
                      outline
                      onBackground="base-content"
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
                <div class="h-full" data-cursor-zone="nav">
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
                    projectState.thisUserPermissions.can_view_data
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
