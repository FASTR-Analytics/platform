import { useNavigate } from "@solidjs/router";
import { _DEV_USERS, t3, TC } from "lib";
import {
  Button,
  FrameLeft,
  FrameTop,
  TabsNavigation,
  getEditorWrapper,
  openComponent,
  type Tabs,
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
  isGlobalAdmin: boolean;
  projectId: string;
  currentUserEmail: string;
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
    <ProjectSSEBoundary projectId={p.projectId}>
      <ProjectInner
        isGlobalAdmin={p.isGlobalAdmin}
        currentUserEmail={p.currentUserEmail}
      />
    </ProjectSSEBoundary>
  );
}

function ProjectInner(p: { isGlobalAdmin: boolean; currentUserEmail: string }) {
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

  const allTabs = [
    ...(projectState.thisUserPermissions.can_view_slide_decks
      ? [
          {
            value: "decks" as const,
            label: t3({ en: "Slide decks", fr: "Présentations" }),
          },
        ]
      : []),
    ...(projectState.thisUserPermissions.can_view_visualizations
      ? [
          {
            value: "visualizations" as const,
            label: t3({ en: "Visualizations", fr: "Visualisations" }),
          },
        ]
      : []),
    // ...(projectState.thisUserPermissions.can_view_metrics
    //   ? [{ value: "metrics" as const, label: t3({ en: "Metrics", fr: "Indicateurs" }) }]
    //   : []),
    ...(projectState.thisUserPermissions.can_configure_modules ||
    projectState.thisUserPermissions.can_run_modules ||
    projectState.thisUserPermissions.can_view_script_code
      ? [
          {
            value: "modules" as const,
            label: t3({ en: "Modules", fr: "Modules" }),
          },
        ]
      : []),
    ...(projectState.thisUserPermissions.can_view_data
      ? [
          {
            value: "data" as const,
            label: t3({ en: "Data", fr: "Données" }),
          },
        ]
      : []),
    ...(projectState.thisUserPermissions.can_configure_settings
      ? [
          {
            value: "settings" as const,
            label: t3(TC.settings),
          },
        ]
      : []),
    ...(_DEV_USERS.includes(p.currentUserEmail)
      ? [
          {
            value: "cache" as const,
            label: t3({ en: "Cache", fr: "Cache" }),
          },
        ]
      : []),
  ];

  const tabIcons = {
    decks: "sparkles" as const,
    reports: "report" as const,
    visualizations: "chart" as const,
    metrics: "badge" as const,
    modules: "code" as const,
    data: "database" as const,
    settings: "settings" as const,
    cache: "database" as const,
  };

  const tabs: Tabs = {
    currentTab: projectTab,
    setCurrentTab: (tab) => {
      const newTab = typeof tab === "function" ? tab(projectTab()) : tab;
      updateProjectView({ tab: newTab as TabOption });
    },
    tabs: allTabs,
    isTabActive: (tab) => projectTab() === tab,
    getAllTabs: () => allTabs.map((t) => t.value),
  };

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
                    tabs={tabs}
                    vertical
                    collapsible
                    collapsed={navCollapsed()}
                    onCollapsedChange={setNavCollapsed}
                    icons={tabIcons}
                    dots={{
                      ...(dataNeedsUpdate() && { data: "warning" as const }),
                      ...(modulesHaveError()
                        ? { modules: "danger" as const }
                        : modulesNeedUpdate() && {
                            modules: "warning" as const,
                          }),
                    }}
                  />
                </div>
              }
            >
              <Switch>
                <Match
                  when={
                    projectTab() === "decks" &&
                    projectState.thisUserPermissions.can_view_slide_decks
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
                    projectState.thisUserPermissions.can_view_visualizations
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
                    projectState.thisUserPermissions.can_view_metrics
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
                    (projectState.thisUserPermissions.can_configure_modules ||
                      projectState.thisUserPermissions.can_run_modules ||
                      projectState.thisUserPermissions.can_view_script_code)
                  }
                >
                  <ProjectModules
                    isGlobalAdmin={p.isGlobalAdmin}
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
                  <ProjectData isGlobalAdmin={p.isGlobalAdmin} />
                </Match>
                <Match
                  when={
                    projectTab() === "settings" &&
                    projectState.thisUserPermissions.can_configure_settings
                  }
                >
                  <ProjectSettings
                    isGlobalAdmin={p.isGlobalAdmin}
                    backToHome={() => navigate("/")}
                  />
                </Match>
                <Match when={projectTab() === "cache" && p.isGlobalAdmin}>
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
