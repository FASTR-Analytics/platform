import type {
  DashboardSummary,
  PresentationObjectSummary,
  ProjectSseMessage,
  ProjectUser,
  ReportFolder,
  ReportSummary,
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

// The optional fields are sent ONLY by the writer that changed them (the
// client applies each one when present) — PROTOCOL_APP_STATE "aiContext
// quirk".
export function notifyProjectConfigUpdated(
  projectId: string,
  data: Extract<
    ProjectSseMessage,
    { type: "project_config_updated" }
  >["data"],
): void {
  notifyProjectV2(projectId, { type: "project_config_updated", data });
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

export function notifyProjectReportsUpdated(
  projectId: string,
  reports: ReportSummary[]
): void {
  notifyProjectV2(projectId, {
    type: "reports_updated",
    data: { reports },
  });
}

export function notifyProjectReportFoldersUpdated(
  projectId: string,
  reportFolders: ReportFolder[]
): void {
  notifyProjectV2(projectId, {
    type: "report_folders_updated",
    data: { reportFolders },
  });
}

export function notifyProjectDashboardsUpdated(
  projectId: string,
  dashboards: DashboardSummary[]
): void {
  notifyProjectV2(projectId, {
    type: "dashboards_updated",
    data: { dashboards },
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

export function notifyProjectRunAttached(
  projectId: string,
  data: Extract<ProjectSseMessage, { type: "run_attached" }>["data"],
): void {
  notifyProjectV2(projectId, { type: "run_attached", data });
}

export function notifyProjectAdminArea2Changed(
  projectId: string,
  adminArea2: string | null,
): void {
  notifyProjectV2(projectId, {
    type: "admin_area_2_changed",
    data: { adminArea2 },
  });
}
