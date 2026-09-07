import { Hono } from "hono";
import { InstanceMeta } from "lib";
import {
  getInstanceDetail,
  getProjectsForUser,
  setStructureSchema,
  updateAdminAreaLabelsConfig,
} from "../../db/mod.ts";
import { notifyInstanceConfigUpdatedFromDb } from "../../task_management/notify_instance_updated.ts";
import {
  _DATABASE_FOLDER,
  _INSTANCE_CALENDAR,
  _INSTANCE_COUNTRY_ISO3,
  _INSTANCE_FISCAL_YEAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _IS_PRODUCTION,
  _OPEN_ACCESS,
  _SERVER_VERSION,
  _START_TIME,
} from "../../exposed_env_vars.ts";
import { log } from "../../middleware/mod.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";
import { checkSpaceForNewProject } from "../../utils/disk_space.ts";

export const routesInstance = new Hono();

defineRoute(routesInstance, "getInstanceMeta", async (c) => {
  const currentTime = new Date().toISOString();
  const startTime = new Date(_START_TIME);
  const uptimeMs = Date.now() - startTime.getTime();

  const instance: InstanceMeta = {
    instanceName: _INSTANCE_NAME,
    instanceCalendar: _INSTANCE_CALENDAR,
    instanceFiscalYear: _INSTANCE_FISCAL_YEAR,
    instanceLanguage: _INSTANCE_LANGUAGE,
    openAccess: _OPEN_ACCESS,
    serverVersion: _SERVER_VERSION,
    adminVersion: "Same as server",
    startTime: _START_TIME,
    currentTime,
    uptimeMs,
    environment: _IS_PRODUCTION ? "production" : "development",
    databaseFolder: _DATABASE_FOLDER,
    isHealthy: true,
  };
  return c.json({
    success: true,
    data: instance,
  });
});

defineRoute(
  routesInstance,
  "getInstanceDetail",
  requireGlobalPermission(),
  log("getInstanceDetail"),
  async (c) => {
    const res = await getInstanceDetail(c.var.mainDb, c.var.globalUser);
    return c.json(res);
  },
);

defineRoute(
  routesInstance,
  "getMyProjects",
  requireGlobalPermission(),
  async (c) => {
    const projects = await getProjectsForUser(c.var.mainDb, c.var.globalUser);
    return c.json({ success: true, data: projects });
  },
);

defineRoute(
  routesInstance,
  "updateStructureSchema",
  requireGlobalPermission("can_configure_settings"),
  log("updateStructureSchema"),
  async (c, { body }) => {
    const res = await setStructureSchema(c.var.mainDb, body.family, body.schema);
    if (res.success) {
      await notifyInstanceConfigUpdatedFromDb(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(
  routesInstance,
  "updateAdminAreaLabelsConfig",
  requireGlobalPermission("can_configure_settings"),
  log("updateAdminAreaLabelsConfig"),
  async (c, { body }) => {
    const res = await updateAdminAreaLabelsConfig(c.var.mainDb, body);
    if (res.success) {
      await notifyInstanceConfigUpdatedFromDb(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(routesInstance, "getDiskSpace", requireGlobalPermission(), async (c) => {
  const res = await checkSpaceForNewProject();
  return c.json({ success: true, data: { ok: res.ok, availableGB: res.availableGB } });
});
