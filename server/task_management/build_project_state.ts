import { ProjectState, type ProjectUser } from "lib";
import type { Sql } from "postgres";
import { getProjectDetail } from "../db/project/projects.ts";
import type { ProjectPk } from "../server_only_types/mod.ts";
import { getProjectDirtyStates } from "./get_project_dirty_states.ts";

/**
 * Builds a complete ProjectState for a given project.
 *
 * Combines data from:
 * - getProjectDetail (project metadata, modules, visualizations, etc.)
 * - getProjectDirtyStates (dirty states, timestamps, running status)
 *
 * This function is used by the v2 SSE endpoint to build the initial `starting` payload.
 * It does NOT modify the existing getProjectDetail or getProjectDirtyStates functions.
 */
export async function buildProjectState(
  mainDb: Sql,
  ppk: ProjectPk,
  projectUser: ProjectUser | undefined
): Promise<{ success: true; data: ProjectState } | { success: false; err: string }> {
  const [detailResult, dirtyStatesResult] = await Promise.all([
    getProjectDetail(projectUser, mainDb, ppk.projectDb, ppk.projectId),
    getProjectDirtyStates(ppk),
  ]);

  if (!detailResult.success) {
    return { success: false, err: detailResult.err ?? "Failed to get project detail" };
  }

  if (!dirtyStatesResult.success) {
    return { success: false, err: dirtyStatesResult.err ?? "Failed to get project dirty states" };
  }

  const detail = detailResult.data;
  const dirtyStates = dirtyStatesResult.data;

  const projectState: ProjectState = {
    // Ready flag
    isReady: true,
    currentUserEmail: projectUser?.email ?? "",

    // From ProjectDetail (excluding aiContext)
    id: detail.id,
    label: detail.label,
    thisUserRole: detail.thisUserRole,
    isLocked: detail.isLocked,
    projectDatasets: detail.projectDatasets,
    projectModules: detail.projectModules,
    metrics: detail.metrics,
    commonIndicators: detail.commonIndicators,
    visualizations: detail.visualizations,
    visualizationFolders: detail.visualizationFolders,
    slideDecks: detail.slideDecks,
    slideDeckFolders: detail.slideDeckFolders,
    projectUsers: detail.projectUsers,
    thisUserPermissions: detail.thisUserPermissions,

    // From ProjectDirtyStates
    projectLastUpdated: dirtyStates.projectLastUpdated,
    anyRunning: dirtyStates.anyRunning,
    moduleDirtyStates: dirtyStates.moduleDirtyStates,
    moduleLastRun: dirtyStates.moduleLastRun,
    moduleLastRunGitRef: dirtyStates.moduleLastRunGitRef,
    lastUpdated: dirtyStates.lastUpdated,
  };

  return { success: true, data: projectState };
}
