import { Hono } from "hono";
import {
  DBProject,
  DBUser,
  getCurrentDatasetHmisMaxVersionId,
  GetAiUsageLogs,
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

  const hasRunningModules = (
    await Promise.all(
      projects.map(async (p: DBProject) => {
        try {
          const projectDb = getPgConnectionFromCacheOrNew(p.id, "READ_ONLY");
          const [row] = await projectDb<{ count: number }[]>`
            SELECT COUNT(*) AS count FROM modules WHERE dirty IN ('running')
          `;
          return row.count > 0;
        } catch {
          return false;
        }
      })
    )
  ).some(Boolean);

  const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
  const hfaTimePointCount = (await mainDb<{ count: number }[]>`SELECT COUNT(*) as count FROM dataset_hfa_dictionary_time_points`)[0].count;

  const [lastLog] = await mainDb<
    UserLog[]
  >`SELECT user_email, endpoint, timestamp FROM user_logs WHERE user_email NOT IN ('nick@usefuldata.com.au', 'timroberton@gmail.com') ORDER BY timestamp DESC LIMIT 1`;

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
    hasRunningModules,
    datasets: {
      hmis: hmisVersion
        ? {
            versionId: hmisVersion,
          }
        : null,
      hfa: hfaTimePointCount > 0 ? { timePoints: hfaTimePointCount } : null,
    },
  });
});

routesHealth.get("/projects", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const projects = await mainDb<{ id: string; label: string }[]>`SELECT id, label FROM projects ORDER BY LOWER(label)`;
  return c.json({ projects });
});

routesHealth.get("/user_logs", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const logs = await mainDb<UserLog[]>`SELECT user_email, endpoint, timestamp, project_id FROM user_logs WHERE endpoint = 'getCurrentUser' ORDER BY timestamp DESC`;
  return c.json({ logs });
});

routesHealth.get("/project_activity", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await mainDb<{ project_id: string; count: string }[]>`
    SELECT project_id, COUNT(*)::text AS count
    FROM user_logs
    WHERE project_id IS NOT NULL AND timestamp >= ${sevenDaysAgo}
    GROUP BY project_id
  `;
  return c.json({ projectActivity: rows });
});

routesHealth.get("/user_activity", async (c) => {
  const email = c.req.query("email");
  if (!email) {
    return c.json({ activeDays: [] });
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const rows: { day: string }[] = await mainDb`
SELECT DISTINCT DATE(timestamp)::text AS day
FROM user_logs
WHERE user_email = ${email}
ORDER BY day
  `;
  return c.json({ activeDays: rows.map((r) => r.day) });
});

routesHealth.get("/ai_usage", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const since = c.req.query("since");
  const logs = await GetAiUsageLogs(mainDb, since ?? undefined);
  return c.json({ logs });
});
