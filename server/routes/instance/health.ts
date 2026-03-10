import { Hono } from "hono";
import {
  DBProject,
  DBUser,
  getCurrentDatasetHfaMaxVersionId,
  getCurrentDatasetHmisMaxVersionId,
  getPgConnectionFromCacheOrNew,
  UserLog,
} from "../../db/mod.ts";
import {
  _DATABASE_FOLDER,
  _INSTANCE_CALENDAR,
  _INSTANCE_LANGUAGE,
  _INSTANCE_NAME,
  _IS_PRODUCTION,
  _SERVER_VERSION,
  _START_TIME,
} from "../../exposed_env_vars.ts";

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

  const [lastLog] = await mainDb<
    UserLog[]
  >`SELECT user_email, endpoint, timestamp FROM user_logs ORDER BY timestamp DESC LIMIT 1`;

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
    serverUsers: users.map((u: DBUser) => u.email),
    projects: projects.map((p) => p.label),
    lastUserLog: lastLog
      ? {
          userEmail: lastLog.user_email,
          endpoint: lastLog.endpoint,
          timestamp: lastLog.timestamp,
        }
      : null,
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
