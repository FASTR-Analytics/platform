import { Hono } from "hono";
import {
  addDatasetHfaToProject,
  addDatasetHmisToProject,
  addProject,
  addProjectUserRole,
  copyProject,
  deleteProject,
  getProjectDetail,
  getProjectUserPermissions,
  removeDatasetFromProject,
  removeProjectUserRole,
  setProjectLockStatus,
  updateProject,
  updateProjectUserPermissions,
  updateProjectUserRole,
} from "../../db/mod.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import {
  notifyLastUpdated,
  setAllModulesDirty,
  setModulesDirtyForDataset,
} from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { streamResponse } from "../streaming.ts";
import { GetLogsByProject } from "../../db/instance/user_logs.ts";
import { log } from "../../middleware/logging.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";

export const routesProject = new Hono();

defineRoute(
  routesProject,
  "createProject",
  requireGlobalPermission("can_create_projects"),
  log("createProject"),
  async (c, { body }) => {
    const res = await addProject(
      c.var.mainDb,
      c.var.globalUser,
      body.label,
      body.datasetsToEnable,
      body.modulesToEnable,
      body.projectEditors,
      body.projectViewers,
    );
    if (res.success === false) {
      return c.json(res);
    }
    for (const enabledDataset of res.data.datasetLastUpdateds) {
      await setModulesDirtyForDataset(
        {
          projectId: res.data.newProjectId,
          projectDb: res.data.projectDb,
        },
        enabledDataset.datasetType,
      );
      notifyLastUpdated(
        res.data.newProjectId,
        "datasets",
        [enabledDataset.datasetType],
        enabledDataset.lastUpdated,
      );
    }
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
    console.log("updateProjectUserRole body:", JSON.stringify(body));
    console.log("projectId:", body.projectId, "type:", typeof body.projectId);
    const res = await updateProjectUserRole(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.emails,
      body.role,
    );
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
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "addDatasetToProject",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_data",
  ),
  log("addDatasetToProject"),
  (c, { body }) => {
    return streamResponse<{ lastUpdated: string }>(c, async (writer) => {
      await writer.progress(0, "Starting dataset addition...");

      const res =
        body.datasetType === "hmis"
          ? await addDatasetHmisToProject(
              c.var.mainDb,
              c.var.ppk.projectDb,
              c.var.ppk.projectId,
              body.windowing,
              writer.progress.bind(writer),
            )
          : body.datasetType === "hfa"
            ? await addDatasetHfaToProject(
                c.var.mainDb,
                c.var.ppk.projectDb,
                c.var.ppk.projectId,
                writer.progress.bind(writer),
              )
            : { success: false as const, err: "Can only do hmis and hfa" };

      if (res.success === false) {
        await writer.error(res.err);
        return;
      }

      await writer.progress(0.9, "Updating module dependencies...");
      await setModulesDirtyForDataset(c.var.ppk, body.datasetType);
      notifyLastUpdated(
        c.var.ppk.projectId,
        "datasets",
        [body.datasetType],
        res.data.lastUpdated,
      );

      await writer.complete(res.data);
    });
  },
);

defineRoute(
  routesProject,
  "removeDatasetFromProject",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_data",
  ),
  log("removeDatasetFromProject"),
  async (c, { params }) => {
    const res = await removeDatasetFromProject(
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
      params.dataset_type,
    );
    await setModulesDirtyForDataset(c.var.ppk, params.dataset_type);
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
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "setAllModulesDirty",
  requireProjectPermission({ requireAdmin: true }),
  log("setAllModulesDirty"),
  async (c) => {
    await setAllModulesDirty(c.var.ppk);
    return c.json({ success: true });
  },
);

defineRoute(
  routesProject,
  "copyProject",
  requireProjectPermission({ requireAdmin: true }),
  log("copyProject"),
  async (c, { params, body }) => {
    const res = await copyProject(
      c.var.mainDb,
      params.project_id,
      body.newProjectLabel,
      c.var.globalUser,
    );
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
    if (!res.success) return c.json(res, 500);
    return c.json(res.data);
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
    return c.json(res);
  },
);

defineRoute(
  routesProject,
  "removeProjectUserRole",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_users",
  ),
  log("removeProjectUserRole"),
  async (c, { body }) => {
    const res = await removeProjectUserRole(
      c.var.mainDb,
      c.var.ppk.projectId,
      body.email,
    );
    return c.json(res);
  },
);
