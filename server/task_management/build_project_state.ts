import { ProjectState, type ProjectUser } from "lib";
import type { Sql } from "postgres";
import { getProjectDetail } from "../db/project/projects.ts";
import type { ProjectPk } from "../server_only_types/mod.ts";
import { getProjectLastUpdatedState } from "./project_last_updated.ts";

/**
 * Builds a complete ProjectState for a given project.
 *
 * Combines data from:
 * - getProjectDetail (project metadata, run-derived catalog, visualizations, etc.)
 * - getProjectLastUpdatedState (per-entity last-updated stamps)
 *
 * This function is used by the v2 SSE endpoint to build the initial `starting` payload.
 */
export async function buildProjectState(
  mainDb: Sql,
  ppk: ProjectPk,
  projectUser: ProjectUser | undefined
): Promise<{ success: true; data: ProjectState } | { success: false; err: string }> {
  const [detailResult, lastUpdatedResult] = await Promise.all([
    getProjectDetail(projectUser, mainDb, ppk.projectDb, ppk.projectId),
    getProjectLastUpdatedState(ppk),
  ]);

  if (!detailResult.success) {
    return { success: false, err: detailResult.err ?? "Failed to get project detail" };
  }

  if (!lastUpdatedResult.success) {
    return { success: false, err: lastUpdatedResult.err ?? "Failed to get project last-updated state" };
  }

  const detail = detailResult.data;
  const lastUpdatedState = lastUpdatedResult.data;

  const projectState: ProjectState = {
    // Ready flag
    isReady: true,
    currentUserEmail: projectUser?.email ?? "",

    // From ProjectDetail
    id: detail.id,
    label: detail.label,
    aiContext: detail.aiContext,
    thisUserRole: detail.thisUserRole,
    isLocked: detail.isLocked,
    isCentralReporting: detail.isCentralReporting,
    attachedRunId: detail.attachedRunId,
    projectDatasets: detail.projectDatasets,
    projectModules: detail.projectModules,
    metrics: detail.metrics,
    commonIndicators: detail.commonIndicators,
    icehIndicators: detail.icehIndicators,
    hfaTaxonomy: detail.hfaTaxonomy,
    visualizations: detail.visualizations,
    visualizationFolders: detail.visualizationFolders,
    slideDecks: detail.slideDecks,
    slideDeckFolders: detail.slideDeckFolders,
    reports: detail.reports,
    reportFolders: detail.reportFolders,
    dashboards: detail.dashboards,
    projectUsers: detail.projectUsers,
    thisUserPermissions: detail.thisUserPermissions,

    // Per-entity last-updated stamps
    projectLastUpdated: lastUpdatedState.projectLastUpdated,
    lastUpdated: lastUpdatedState.lastUpdated,
  };

  return { success: true, data: projectState };
}
