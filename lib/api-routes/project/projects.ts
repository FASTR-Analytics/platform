import { z } from "zod";
import {
  PROJECT_PERMISSIONS,
} from "../../types/mod.ts";
import type {
  ProjectPermission,
  ProjectUserRoleType,
  UserLog,
  ProjectDetail,
  DatasetHmisWindowingCommon,
  DatasetType,
  ModuleId,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const projectIdParamsSchema = z.object({ project_id: z.uuid() });

const datasetTypeSchema = z.enum(["hmis", "hfa", "iceh"]);

// Same security rationale as users.ts permissionsSchema: these keys flow into SQL SET clauses
// via sql(permissions), so only known ProjectPermission column names must pass.
const projectPermissionsRequiredSchema = z.object(
  Object.fromEntries(PROJECT_PERMISSIONS.map((k) => [k, z.boolean()])) as Record<ProjectPermission, z.ZodBoolean>
);
const projectPermissionsPartialSchema = projectPermissionsRequiredSchema.partial();

const datasetHmisWindowingBaseSchema = z.object({
  start: z.number(),
  end: z.number(),
  takeAllIndicators: z.boolean(),
  takeAllAdminArea2s: z.boolean(),
  adminArea2sToInclude: z.array(z.string()),
  takeAllAdminArea3s: z.boolean().optional(),
  adminArea3sToInclude: z.array(z.string()).optional(),
  takeAllFacilityOwnerships: z.boolean().optional(),
  takeAllFacilityTypes: z.boolean().optional(),
  facilityOwnwershipsToInclude: z.array(z.string()).optional(),
  facilityTypesToInclude: z.array(z.string()).optional(),
});

const datasetHmisWindowingCommonSchema = datasetHmisWindowingBaseSchema.extend({
  indicatorType: z.literal("common"),
  commonIndicatorsToInclude: z.array(z.string()),
});

export const projectRouteRegistry = {
  createProject: route({
    path: "/projects",
    method: "POST",
    body: z.object({
      label: z.string(),
      datasetsToEnable: z.array(datasetTypeSchema),
      modulesToEnable: z.array(z.string()),
      projectEditors: z.array(z.string()),
      projectViewers: z.array(z.string()),
    }),
    response: {} as {
      newProjectId: string;
      datasetLastUpdateds: Array<{
        datasetType: DatasetType;
        lastUpdated: string;
      }>;
    },
  }),

  updateProject: route({
    path: "/project/:project_id",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ label: z.string(), aiContext: z.string() }),
    requiresProject: true,
  }),

  deleteProject: route({
    path: "/project/:project_id",
    method: "DELETE",
    params: projectIdParamsSchema,
    requiresProject: true,
  }),

  restoreProject: route({
    path: "/project/:project_id/restore",
    method: "POST",
    params: projectIdParamsSchema,
    requiresProject: true,
  }),

  forceDeleteProject: route({
    path: "/project/:project_id/force-delete",
    method: "POST",
    params: projectIdParamsSchema,
    requiresProject: true,
  }),

  setProjectLockStatus: route({
    path: "/project/:project_id/lock",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ lockAction: z.enum(["lock", "unlock"]) }),
    requiresProject: true,
  }),

  setProjectCentralReportingStatus: route({
    path: "/project/:project_id/central_reporting",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ isCentralReporting: z.boolean() }),
    requiresProject: true,
  }),

  updateProjectUserRole: route({
    path: "/project_user_role",
    method: "POST",
    body: z.object({
      emails: z.array(z.string()),
      role: z.enum(["none", "viewer", "editor"]),
    }),
    requiresProject: true,
  }),

  getProjectDetail: route({
    path: "/project_detail",
    method: "GET",
    response: {} as ProjectDetail,
    requiresProject: true,
  }),

  addDatasetToProject: route({
    path: "/project_datasets",
    method: "POST",
    body: z.object({
      datasetType: datasetTypeSchema,
      windowing: datasetHmisWindowingCommonSchema.optional(),
      serviceCategoryScope: z.array(z.string()).optional(),
      skipModuleRerun: z.boolean().optional(),
    }),
    response: {} as { lastUpdated: string },
    requiresProject: true,
    isStreaming: true,
  }),

  removeDatasetFromProject: route({
    path: "/project_datasets/:dataset_type",
    method: "DELETE",
    params: z.object({ dataset_type: datasetTypeSchema }),
    requiresProject: true,
  }),

  setAllModulesDirty: route({
    path: "/project/dirty-all",
    method: "POST",
    requiresProject: true,
  }),

  copyProject: route({
    path: "/project/:project_id/copy",
    method: "POST",
    params: projectIdParamsSchema,
    body: z.object({ newProjectLabel: z.string() }),
    response: {} as { newProjectId: string },
    requiresProject: true,
    timeoutMs: 600000,
  }),

  getProjectLogs: route({
    path: "/project-logs",
    method: "GET",
    response: {} as UserLog[],
    requiresProject: true,
  }),

  updateProjectUserPermissions: route({
    path: "/update_project_user_permissions",
    method: "POST",
    body: z.object({
      emails: z.array(z.string()),
      permissions: projectPermissionsRequiredSchema,
    }),
    requiresProject: true,
  }),

  getProjectUserPermissions: route({
    path: "/get_project_user_permissions/:projectId/:email",
    method: "GET",
    params: z.object({ projectId: z.uuid(), email: z.string() }),
    response: {} as { permissions: Record<ProjectPermission, boolean> },
    requiresProject: true,
  }),

  addProjectUserRole: route({
    path: "/add_project_user_role",
    method: "POST",
    body: z.object({ email: z.string() }),
    requiresProject: true,
  }),

  bulkUpdateProjectUserPermissions: route({
    path: "/bulk_update_project_user_permissions",
    method: "POST",
    body: z.object({
      emails: z.array(z.string()),
      permissions: projectPermissionsPartialSchema,
    }),
    requiresProject: true,
  }),

} as const;
