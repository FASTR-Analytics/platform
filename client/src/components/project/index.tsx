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
import {
  createEffect,
  createMemo,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { ProjectRunStatus } from "~/components/DirtyStatus";
import { ProjectSSEBoundary } from "~/state/project/t1_sse";
import { projectState } from "~/state/project/t1_store";

import { ProjectData } from "./project_data";
import { ProjectDecks } from "./project_decks";
import { ProjectReports } from "./project_reports";
import { ProjectDashboards } from "./project_dashboards";
import { ProjectMetrics } from "./project_metrics";
import { ProjectModules } from "./project_modules";
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
  moduleLatestCommits,
  setModuleLatestCommits,
} from "~/state/t4_ui";
import type { TabOption } from "~/state/t4_ui";
import { AIProjectWrapper, useAIProjectContext } from "../project_ai";
import { instanceState } from "~/state/instance/t1_store";
import { serverActions } from "~/server_actions";
import {
  checkDataNeedsUpdate,
  checkModulesNeedUpdate,
} from "./staleness_checks";

type Props = {
  projectId: string;
  currentUserEmail: string;
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
    <ProjectSSEBoundary projectId={p.projectId}>
      <ProjectInner currentUserEmail={p.currentUserEmail} />
    </ProjectSSEBoundary>
  );
}

function ProjectInner(p: { currentUserEmail: string }) {
  const navigate = useNavigate();

  const { openEditor: openProjectEditor, EditorWrapper: ProjectEditorWrapper } =
    getEditorWrapper();

  onMount(async () => {
    if (moduleLatestCommits() === undefined) {
      const res = await serverActions.checkModuleUpdates({});
      if (res.success) {
        setModuleLatestCommits(res.data);
      }
    }
  });

  const dataNeedsUpdate = createMemo(() =>
    checkDataNeedsUpdate(projectState, instanceState),
  );

  const modulesNeedUpdate = createMemo(() =>
    checkModulesNeedUpdate(projectState.projectModules, moduleLatestCommits()),
  );

  const modulesHaveError = createMemo(() =>
    projectState.projectModules.some(
      (mod) => projectState.moduleDirtyStates[mod.id] === "error",
    ),
  );

  const tabItems = (): ListItem<TabOption>[] => {
    const perms = projectState.thisUserPermissions;
    const items: ListItem<TabOption>[] = [];
    if (perms.can_view_reports) {
      items.push({
        id: "reports",
        label: t3({ en: "Reports", fr: "Rapports" }),
        iconName: "report",
      });
    }
    if (perms.can_view_slide_decks) {
      items.push({
        id: "decks",
        label: t3({ en: "Slide decks", fr: "Présentations" }),
        iconName: "sparkles",
      });
      items.push({
        id: "dashboards",
        label: t3({ en: "Dashboards", fr: "Tableaux de bord" }),
        iconName: "box",
      });
    }
    if (perms.can_view_visualizations) {
      items.push({
        id: "visualizations",
        label: t3({ en: "Visualizations", fr: "Visualisations" }),
        iconName: "chart",
      });
    }
    if (
      perms.can_configure_modules ||
      perms.can_run_modules ||
      perms.can_view_script_code
    ) {
      items.push({
        id: "modules",
        label: t3({ en: "Modules", fr: "Modules" }),
        iconName: "code",
        dot: modulesHaveError()
          ? "danger"
          : modulesNeedUpdate()
            ? "warning"
            : undefined,
      });
    }
    if (perms.can_view_data) {
      items.push({
        id: "data",
        label: t3({ en: "Data", fr: "Données" }),
        iconName: "database",
        dot: dataNeedsUpdate() ? "warning" : undefined,
      });
    }
    if (perms.can_configure_settings) {
      items.push({
        id: "settings",
        label: t3(TC.settings),
        iconName: "settings",
      });
    }
    if (_DEV_USERS.includes(p.currentUserEmail)) {
      items.push({
        id: "cache",
        label: t3({ en: "Cache", fr: "Cache" }),
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
                    projectTab() === "modules" &&
                    (projectState.thisUserPermissions.can_configure_modules ||
                      projectState.thisUserPermissions.can_run_modules ||
                      projectState.thisUserPermissions.can_view_script_code)
                  }
                >
                  <ProjectModules
                    canConfigureModules={
                      projectState.thisUserPermissions.can_configure_modules
                    }
                    canRunModules={
                      projectState.thisUserPermissions.can_run_modules
                    }
                    canViewScriptCode={
                      projectState.thisUserPermissions.can_view_script_code
                    }
                  />
                </Match>
                <Match
                  when={
                    projectTab() === "data" &&
                    projectState.thisUserPermissions.can_view_data
                  }
                >
                  <ProjectData />
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
