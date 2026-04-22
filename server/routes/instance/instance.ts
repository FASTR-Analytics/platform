import { Hono } from "hono";
import { InstanceMeta, type InstanceConfig } from "lib";
import {
  getAdminAreaLabelsConfig,
  getCountryIso3Config,
  getFacilityColumnsConfig,
  getInstanceDetail,
  getMaxAdminAreaConfig,
  getProjectsForUser,
  updateAdminAreaLabelsConfig,
  updateCountryIso3Config,
  updateFacilityColumnsConfig,
  updateMaxAdminArea,
} from "../../db/mod.ts";
import { notifyInstanceConfigUpdated } from "../../task_management/notify_instance_updated.ts";
import {
  _DATABASE_FOLDER,
  _INSTANCE_CALENDAR,
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

export const routesInstance = new Hono();

defineRoute(routesInstance, "getInstanceMeta", async (c) => {
  const currentTime = new Date().toISOString();
  const startTime = new Date(_START_TIME);
  const uptimeMs = Date.now() - startTime.getTime();

  const instance: InstanceMeta = {
    instanceName: _INSTANCE_NAME,
    instanceCalendar: _INSTANCE_CALENDAR,
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
  "updateMaxAdminArea",
  requireGlobalPermission("can_configure_settings"),
  log("updateMaxAdminArea"),
  async (c, { body }) => {
    const res = await updateMaxAdminArea(c.var.mainDb, body.maxAdminArea);
    if (res.success) {
      await notifyConfigUpdated(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(
  routesInstance,
  "updateFacilityColumnsConfig",
  requireGlobalPermission("can_configure_settings"),
  log("updateFacilityColumnsConfig"),
  async (c, { body }) => {
    const res = await updateFacilityColumnsConfig(c.var.mainDb, body);
    if (res.success) {
      await notifyConfigUpdated(c.var.mainDb);
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
      await notifyConfigUpdated(c.var.mainDb);
    }
    return c.json(res);
  },
);

defineRoute(
  routesInstance,
  "updateCountryIso3",
  requireGlobalPermission("can_configure_settings"),
  log("updateCountryIso3"),
  async (c, { body }) => {
    const res = await updateCountryIso3Config(c.var.mainDb, body.countryIso3);
    if (res.success) {
      await notifyConfigUpdated(c.var.mainDb);
    }
    return c.json(res);
  },
);

async function notifyConfigUpdated(mainDb: Parameters<typeof getMaxAdminAreaConfig>[0]) {
  const [maxRes, fcRes, isoRes, labelsRes] = await Promise.all([
    getMaxAdminAreaConfig(mainDb),
    getFacilityColumnsConfig(mainDb),
    getCountryIso3Config(mainDb),
    getAdminAreaLabelsConfig(mainDb),
  ]);
  if (maxRes.success && fcRes.success && isoRes.success && labelsRes.success) {
    const config: InstanceConfig = {
      maxAdminArea: maxRes.data.maxAdminArea,
      facilityColumns: fcRes.data,
      countryIso3: isoRes.data.countryIso3,
      adminAreaLabels: labelsRes.data,
    };
    notifyInstanceConfigUpdated(config);
  }
}
