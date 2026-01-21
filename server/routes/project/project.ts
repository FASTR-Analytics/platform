import { Hono } from "hono";
import {
  addDatasetHfaToProject,
  addDatasetHmisToProject,
  addProject,
  copyProject,
  deleteProject,
  getProjectDetail,
  removeDatasetFromProject,
  setProjectLockStatus,
  updateProject,
  updateProjectUserRole,
} from "../../db/mod.ts";
import {
  checkProjectNotLocked,
  getGlobalAdmin,
  getGlobalNonAdmin,
  getProjectEditor,
  getProjectViewer,
} from "../../project_auth.ts";
import {
  notifyLastUpdated,
  setAllModulesDirty,
  setModulesDirtyForDataset,
} from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";
import { streamResponse } from "../streaming.ts";
import { GetProjectLogs } from "../../db/project/project_user_logs.ts";

export const routesProject = new Hono();

defineRoute(
  routesProject,
  "createProject",
  getGlobalAdmin,
  async (c, { body }) => {
    const res = await addProject(
      c.var.mainDb,
      c.var.globalUser,
      body.label,
      body.datasetsToEnable,
      body.modulesToEnable,
      body.projectEditors,
      body.projectViewers
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
        enabledDataset.datasetType
      );
      notifyLastUpdated(
        res.data.newProjectId,
        "datasets",
        [enabledDataset.datasetType],
        enabledDataset.lastUpdated
      );
    }
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "getProjectDetail",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c) => {
    const res = await getProjectDetail(
      c.var.projectUser,
      c.var.mainDb,
      c.var.ppk.projectDb,
      c.var.ppk.projectId
    );
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "updateProjectUserRole",
  getGlobalAdmin,
  async (c, { body }) => {
    console.log("updateProjectUserRole body:", JSON.stringify(body));
    console.log("projectId:", body.projectId, "type:", typeof body.projectId);
    const res = await updateProjectUserRole(
      c.var.mainDb,
      body.projectId,
      body.emails,
      body.role
    );
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "updateProject",
  getGlobalAdmin,
  checkProjectNotLocked,
  async (c, { params, body }) => {
    const res = await updateProject(
      c.var.mainDb,
      params.project_id,
      body.label,
      body.aiContext
    );
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "addDatasetToProject",
  getGlobalNonAdmin,
  getProjectEditor,
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
              writer.progress.bind(writer)
            )
          : body.datasetType === "hfa"
          ? await addDatasetHfaToProject(
              c.var.mainDb,
              c.var.ppk.projectDb,
              c.var.ppk.projectId,
              writer.progress.bind(writer)
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
        res.data.lastUpdated
      );

      await writer.complete(res.data);
    });
  }
);

defineRoute(
  routesProject,
  "removeDatasetFromProject",
  getProjectEditor,
  async (c, { params }) => {
    const res = await removeDatasetFromProject(
      c.var.ppk.projectDb,
      c.var.ppk.projectId,
      params.dataset_type
    );
    await setModulesDirtyForDataset(c.var.ppk, params.dataset_type);
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "deleteProject",
  getGlobalAdmin,
  checkProjectNotLocked,
  async (c, { params }) => {
    const res = await deleteProject(c.var.mainDb, params.project_id);
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "setProjectLockStatus",
  getGlobalAdmin,
  async (c, { params, body }) => {
    const res = await setProjectLockStatus(
      c.var.mainDb,
      params.project_id,
      body.lockAction
    );
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "setAllModulesDirty",
  getGlobalAdmin,
  getProjectEditor,
  async (c) => {
    await setAllModulesDirty(c.var.ppk);
    return c.json({ success: true });
  }
);

defineRoute(
  routesProject,
  "copyProject",
  getGlobalAdmin,
  async (c, { params, body }) => {
    const res = await copyProject(
      c.var.mainDb,
      params.project_id,
      body.newProjectLabel,
      c.var.globalUser
    );
    return c.json(res);
  }
);

defineRoute(
  routesProject,
  "getProjectLogs",
  async (c) => {
    const res = await GetProjectLogs(c.var.ppk.projectDb, c.var.ppk.projectId);
    if (!res.success) return c.json(res, 500);
    return c.json(res.data);
});
