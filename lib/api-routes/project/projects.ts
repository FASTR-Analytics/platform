import { ProjectLog } from "../../../server/db/mod.ts";
import { ProjectPermission } from "lib";
import type {
  ProjectDetail,
  ProjectUserRoleType,
  DatasetHmisWindowingCommon,
  DatasetType,
  ModuleId,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

// Route registry for projects
export const projectRouteRegistry = {
  // Admin routes
  createProject: route({
    path: "/projects",
    method: "POST",
    body: {} as {
      label: string;
      datasetsToEnable: DatasetType[];
      modulesToEnable: ModuleId[];
      projectEditors: string[];
      projectViewers: string[];
    },
    response: {} as {
      newProjectId: string;
      projectDb: any; // Internal type
      datasetLastUpdateds: Array<{
        datasetType: DatasetType;
        lastUpdated: string;
      }>;
    },
  }),

  updateProject: route({
    path: "/project/:project_id",
    method: "POST",
    params: {} as { project_id: string },
    body: {} as {
      label: string;
      aiContext: string;
    },
  }),

  deleteProject: route({
    path: "/project/:project_id",
    method: "DELETE",
    params: {} as { project_id: string },
  }),

  setProjectLockStatus: route({
    path: "/project/:project_id/lock",
    method: "POST",
    params: {} as { project_id: string },
    body: {} as {
      lockAction: "lock" | "unlock";
    },
  }),

  updateProjectUserRole: route({
    path: "/project_user_role",
    method: "POST",
    body: {} as {
      projectId: string;
      emails: string[];
      role: ProjectUserRoleType;
    },
  }),

  // Project-scoped routes
  getProjectDetail: route({
    path: "/project_detail",
    method: "GET",
    response: {} as ProjectDetail,
    requiresProject: true,
  }),

  addDatasetToProject: route({
    path: "/project_datasets",
    method: "POST",
    body: {} as {
      datasetType: DatasetType;
      windowing: DatasetHmisWindowingCommon | undefined;
    },
    response: {} as { lastUpdated: string },
    requiresProject: true,
    isStreaming: true,
  }),

  removeDatasetFromProject: route({
    path: "/project_datasets/:dataset_type",
    method: "DELETE",
    params: {} as { dataset_type: DatasetType },
    requiresProject: true,
  }),

  setAllModulesDirty: route({
    path: "/project/dirty-all",
    method: "POST",
    response: {} as { success: true },
    requiresProject: true,
  }),

  copyProject: route({
    path: "/project/:project_id/copy",
    method: "POST",
    params: {} as { project_id: string },
    body: {} as { newProjectLabel: string },
    response: {} as { newProjectId: string },
  }),

  getProjectLogs: route({
    path: "/project-logs",
    method: "GET",
    response: {} as ProjectLog[],
    requiresProject: true,
  }),

  updateProjectUserPermissions: route({
    path: "/update_project_user_permissions",
    method: "POST",
    body: {} as {
      projectId: string;
      emails: string[];
      permissions: Record<ProjectPermission, boolean>;
    },
  }),

  getProjectUserPermissions: route({
    path: ("/get_project_user_permissions"),
    method: "GET",
    body: {} as {
      projectId: string;
      email: string;
    }
  })
} as const;
