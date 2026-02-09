import { Hono } from "hono";
import { InstanceMeta } from "lib";
import {
  getInstanceDetail,
  updateCountryIso3Config,
  updateFacilityColumnsConfig,
  updateMaxAdminArea,
} from "../../db/mod.ts";
import {
  _DATABASE_FOLDER,
  _INSTANCE_CALENDAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _INSTANCE_REDIRECT_URL,
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
    instanceRedirectUrl: _INSTANCE_REDIRECT_URL,
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
  "updateMaxAdminArea",
  requireGlobalPermission("can_configure_settings"),
  log("updateMaxAdminArea"),
  async (c, { body }) => {
    const res = await updateMaxAdminArea(c.var.mainDb, body.maxAdminArea);
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
    return c.json(res);
  },
);
