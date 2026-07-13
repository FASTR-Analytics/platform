import { Hono } from "hono";
import {
  addProject,
  addProjectUserRole,
  bulkUpdateProjectUserPermissions,
  closePgConnection,
  copyProjectSync,
  copyProjectInBackground,
  deleteProject,
  forceDeleteProject,
  restoreProject,
  getProjectDetail,
  getProjectUserPermissions,
  setProjectCentralReportingStatus,
  setProjectLockStatus,
  updateProject,
  updateProjectUserPermissions,
  updateProjectUserRole,
} from "../../db/mod.ts";
import type { ModuleId } from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import {
  notifyProjectConfigUpdated,
  notifyProjectUsersUpdated,
} from "../../task_management/notify_project_v2.ts";
import { notifyInstanceProjectsLastUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { GetLogsByProject } from "../../db/instance/user_logs.ts";
import { log } from "../../middleware/logging.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { H_USERS } from "lib";
import {
  checkSpaceForCopyProject,
  checkSpaceForNewProject,
} from "../../utils/disk_space.ts";

export const routesProject = new Hono();

defineRoute(
  routesProject,
  "createProject",
  requireGlobalPermission("can_create_projects"),
  log("createProject"),
  async (c, { body }) => {
    const spaceCheck = await checkSpaceForNewProject();
    if (!spaceCheck.ok) {
      return c.json({
        success: false,
        err: spaceCheck.resizeTriggered
          ? `Not enough disk space to create a new project (${spaceCheck.availableGB} GB available). A volume resize has been triggered — please try again in a few minutes.`
          : `Not enough disk space to create a new project (${spaceCheck.availableGB} GB available). Please contact your administrator.`,
      });
    }
    const res = await addProject(
      c.var.mainDb,
      c.var.globalUser,
      body.label,
      body.datasetsToEnable,
      body.modulesToEnable as ModuleId[],
      body.projectEditors,
      body.projectViewers,
    );
    if (res.success === false) {
      return c.json(res);
    }
    for (const enabledDataset of res.data.datasetLastUpdateds) {
      notifyLastUpdated(
        res.data.newProjectId,
        "datasets",
        [enabledDataset.datasetType],
        enabledDataset.lastUpdated,
      );
    }
    notifyInstanceProjectsLastUpdated(new Date().toISOString());
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "getProjectDetail",
  requireProjectPermission(),
  log("getProjectDetail"),
  async (c) => {
    const res = await getProjectDetail(
      c.var.projectUser,
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
    );
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "updateProjectUserRole",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_users",
  ),
  log("updateProjectUserRole"),
  async (c, { body }) => {
    const res = await updateProjectUserRole(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.emails,
      body.role,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      // V2 notify
      notifyProjectUsersUpdated(c.var.ppk.projectId, res.data.projectUsers);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "updateProjectUserPermissions",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_users",
  ),
  log("updateProjectUserPermissions"),
  async (c, { body }) => {
    const res = await updateProjectUserPermissions(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.emails,
      body.permissions,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      // V2 notify
      notifyProjectUsersUpdated(c.var.ppk.projectId, res.data.projectUsers);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "getProjectUserPermissions",
  requireProjectPermission("can_configure_users"),
  log("getProjectUserPermissions"),
  async (c, { params }) => {
    const res = await getProjectUserPermissions(
      c.var.mainDb,
      params.projectId,
      params.email,
    );
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "bulkUpdateProjectUserPermissions",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_users",
  ),
  log("bulkUpdateProjectUserPermissions"),
  async (c, { body }) => {
    const res = await bulkUpdateProjectUserPermissions(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.emails,
      body.permissions,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      // V2 notify
      notifyProjectUsersUpdated(c.var.ppk.projectId, res.data.projectUsers);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "updateProject",
  requireProjectPermission({
    preventAccessToLockedProjects: true,
    requireAdmin: true,
  }),
  log("updateProject"),
  async (c, { params, body }) => {
    const res = await updateProject(
      c.var.mainDb,
      params.project_id,
      body.label,
      body.aiContext,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      notifyProjectConfigUpdated(params.project_id, res.data.label, res.data.isLocked, body.aiContext);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "deleteProject",
  requireProjectPermission({
    preventAccessToLockedProjects: true,
    requireAdmin: true,
  }),
  log("deleteProject"),
  async (c, { params }) => {
    const res = await deleteProject(c.var.mainDb, params.project_id);
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "restoreProject",
  requireProjectPermission({ requireAdmin: true }),
  log("restoreProject"),
  async (c, { params }) => {
    const res = await restoreProject(c.var.mainDb, params.project_id);
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "forceDeleteProject",
  requireProjectPermission({ requireAdmin: true }),
  log("forceDeleteProject"),
  async (c, { params }) => {
    const res = await forceDeleteProject(c.var.mainDb, params.project_id);
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "setProjectLockStatus",
  requireProjectPermission({ requireAdmin: true }),
  log("setProjectLockStatus"),
  async (c, { params, body }) => {
    const res = await setProjectLockStatus(
      c.var.mainDb,
      params.project_id,
      body.lockAction,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      // V2 notify
      notifyProjectConfigUpdated(params.project_id, res.data.label, res.data.isLocked);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "setProjectCentralReportingStatus",
  requireProjectPermission({ requireAdmin: true }),
  log("setProjectCentralReportingStatus"),
  async (c, { params, body }) => {
    if (!H_USERS.includes(c.var.globalUser.email)) {
      return c.json({ success: false, err: "Only h_users can set central reporting status" }, 403);
    }
    const res = await setProjectCentralReportingStatus(
      c.var.mainDb,
      params.project_id,
      body.isCentralReporting,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      notifyProjectConfigUpdated(params.project_id, res.data.label, res.data.isLocked, undefined, res.data.isCentralReporting);
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "copyProject",
  requireProjectPermission({ requireAdmin: true }),
  log("copyProject"),
  async (c, { params, body }) => {
    const copySpaceCheck = await checkSpaceForCopyProject(c.var.mainDb, params.project_id);
    if (!copySpaceCheck.ok) {
      return c.json({
        success: false,
        err: copySpaceCheck.resizeTriggered
          ? `Not enough disk space to copy this project (requires ~${copySpaceCheck.requiredGB} GB, ${copySpaceCheck.availableGB} GB available). A volume resize has been triggered — please try again in a few minutes.`
          : `Not enough disk space to copy this project (requires ~${copySpaceCheck.requiredGB} GB, ${copySpaceCheck.availableGB} GB available). Please contact your administrator.`,
      });
    }
    const res = await copyProjectSync(
      c.var.mainDb,
      params.project_id,
      body.newProjectLabel,
      c.var.globalUser,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      await closePgConnection(params.project_id);
      copyProjectInBackground(params.project_id, res.data.newProjectId)
        .then(async () => {
          const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
          notifyInstanceProjectsLastUpdated(new Date().toISOString());
        })
        .catch(() => {});
    }
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "getProjectLogs",
  requireProjectPermission("can_view_logs"),
  log("getProjectLogs"),
  async (c) => {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
    const res = await GetLogsByProject(mainDb, c.var.ppk.projectId);
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "addProjectUserRole",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_users",
  ),
  log("addProjectUserRole"),
  async (c, { body }) => {
    const res = await addProjectUserRole(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.email,
    );
    if (res.success) {
      notifyInstanceProjectsLastUpdated(new Date().toISOString());
      // V2 notify
      notifyProjectUsersUpdated(c.var.ppk.projectId, res.data.projectUsers);
    }
    return c.json(res);
  },
);
