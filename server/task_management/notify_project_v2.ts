import type {
  DatasetInProject,
  DirtyOrRunStatus,
  InstalledModuleSummary,
  LastUpdateTableName,
  MetricWithStatus,
  PresentationObjectSummary,
  ProjectSseMessage,
  ProjectUser,
  SlideDeckFolder,
  SlideDeckSummary,
  VisualizationFolder,
} from "lib";

const broadcastV2 = new BroadcastChannel("project_updates_v2");

type ProjectSseMessageWithProjectId = ProjectSseMessage & { projectId: string };

export function notifyProjectV2(
  projectId: string,
  message: ProjectSseMessage
): void {
  const msg: ProjectSseMessageWithProjectId = { ...message, projectId };
  broadcastV2.postMessage(msg);
}

export function notifyProjectConfigUpdated(
  projectId: string,
  label: string,
  isLocked: boolean
): void {
  notifyProjectV2(projectId, {
    type: "project_config_updated",
    data: { label, isLocked },
  });
}

export function notifyProjectModulesUpdated(
  projectId: string,
  projectModules: InstalledModuleSummary[],
  metrics: MetricWithStatus[],
  commonIndicators: { id: string; label: string }[]
): void {
  notifyProjectV2(projectId, {
    type: "modules_updated",
    data: { projectModules, metrics, commonIndicators },
  });
}

export function notifyProjectDatasetsUpdated(
  projectId: string,
  projectDatasets: DatasetInProject[]
): void {
  notifyProjectV2(projectId, {
    type: "datasets_updated",
    data: { projectDatasets },
  });
}

export function notifyProjectVisualizationsUpdated(
  projectId: string,
  visualizations: PresentationObjectSummary[]
): void {
  notifyProjectV2(projectId, {
    type: "visualizations_updated",
    data: { visualizations },
  });
}

export function notifyProjectVisualizationFoldersUpdated(
  projectId: string,
  visualizationFolders: VisualizationFolder[]
): void {
  notifyProjectV2(projectId, {
    type: "visualization_folders_updated",
    data: { visualizationFolders },
  });
}

export function notifyProjectSlideDecksUpdated(
  projectId: string,
  slideDecks: SlideDeckSummary[]
): void {
  notifyProjectV2(projectId, {
    type: "slide_decks_updated",
    data: { slideDecks },
  });
}

export function notifyProjectSlideDeckFoldersUpdated(
  projectId: string,
  slideDeckFolders: SlideDeckFolder[]
): void {
  notifyProjectV2(projectId, {
    type: "slide_deck_folders_updated",
    data: { slideDeckFolders },
  });
}

export function notifyProjectUsersUpdated(
  projectId: string,
  projectUsers: ProjectUser[]
): void {
  notifyProjectV2(projectId, {
    type: "project_users_updated",
    data: { projectUsers },
  });
}

export function notifyProjectLastUpdatedV2(
  projectId: string,
  tableName: LastUpdateTableName,
  ids: string[],
  lastUpdated: string
): void {
  notifyProjectV2(projectId, {
    type: "last_updated",
    data: { tableName, ids, lastUpdated },
  });
}

export function notifyProjectModuleDirtyState(
  projectId: string,
  ids: string[],
  dirtyOrRunStatus: DirtyOrRunStatus,
  lastRun?: string,
  lastRunGitRef?: string
): void {
  notifyProjectV2(projectId, {
    type: "module_dirty_state",
    data: { ids, dirtyOrRunStatus, lastRun, lastRunGitRef },
  });
}

export function notifyProjectAnyRunning(
  projectId: string,
  anyRunning: boolean
): void {
  notifyProjectV2(projectId, {
    type: "any_running",
    data: { anyRunning },
  });
}

export function notifyProjectRScript(
  projectId: string,
  moduleId: string,
  text: string
): void {
  notifyProjectV2(projectId, {
    type: "r_script",
    data: { moduleId, text },
  });
}
