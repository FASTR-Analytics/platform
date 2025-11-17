import { Hono } from "hono";
import {
  _DATABASE_FOLDER,
  _INSTANCE_CALENDAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _IS_PRODUCTION,
  _SERVER_VERSION,
  _START_TIME,
} from "../../exposed_env_vars.ts";
import { getPgConnectionFromCacheOrNew } from "../../db/mod.ts";
import {
  getCurrentDatasetHfaMaxVersionId,
  getCurrentDatasetHmisMaxVersionId,
} from "../../db/mod.ts";
import { DBProject, DBUser } from "../../db/instance/_main_database_types.ts";

export const routesHealth = new Hono();

routesHealth.get("/health_check", async (c) => {
  const currentTime = new Date().toISOString();
  const startTime = new Date(_START_TIME);
  const uptimeMs = Date.now() - startTime.getTime();

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const users = await mainDb<DBUser[]>`SELECT * FROM users`;
  const adminUsers = users.filter((u) => u.is_admin).map((u) => u.email);
  const projects = await mainDb<
    DBProject[]
  >`SELECT id, label FROM projects ORDER BY LOWER(label)`;

  const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
  const hfaVersion = await getCurrentDatasetHfaMaxVersionId(mainDb);

  return c.json({
    running: true,
    instanceName: _INSTANCE_NAME,
    serverVersion: _SERVER_VERSION,
    environment: _IS_PRODUCTION ? "production" : "development",
    startTime: _START_TIME,
    currentTime,
    uptimeMs,
    calendar: _INSTANCE_CALENDAR,
    language: _INSTANCE_LANGUAGE,
    databaseFolder: _DATABASE_FOLDER,
    totalUsers: users.length,
    adminUsers,
    projects: projects.map((p) => (p.label)),
    datasets: {
      hmis: hmisVersion
        ? {
          versionId: hmisVersion,
        }
        : null,
      hfa: hfaVersion ? { versionId: hfaVersion } : null,
    },
  });
});
