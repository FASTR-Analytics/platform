import { Context, Hono } from "hono";
import {
  DBProject,
  DBUser,
  getCurrentDatasetHmisMaxVersionId,
  GetAiUsageLogs,
  getPgConnectionFromCacheOrNew,
  UserLog,
} from "../../db/mod.ts";
import { getAnyRunningModules } from "../../task_management/mod.ts";
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

  const hasRunningModules = projects.some((p) => getAnyRunningModules(p.id));

  const hmisVersion = await getCurrentDatasetHmisMaxVersionId(mainDb);
  const hfaTimePointCount = (
    await mainDb<
      { count: number }[]
    >`SELECT COUNT(*) as count FROM hfa_time_points`
  )[0].count;

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
  const projects = await mainDb<
    { id: string; label: string }[]
  >`SELECT id, label FROM projects ORDER BY LOWER(label)`;
  return c.json({ projects });
});

routesHealth.get("/user_logs", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const logs = await mainDb<
    UserLog[]
  >`SELECT user_email, endpoint, timestamp, project_id FROM user_logs WHERE endpoint = 'getCurrentUser' ORDER BY timestamp DESC`;
  return c.json({ logs });
});

routesHealth.get("/project_activity", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
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

routesHealth.get("/pg_stat_statements", async (c: Context) => {
  const orderByRaw = c.req.query("orderBy");
  const orderBy =
    orderByRaw === "mean" ? "mean_exec_time"
    : orderByRaw === "max" ? "max_exec_time"
    : orderByRaw === "calls" ? "calls"
    : "total_exec_time";

  const limitRaw = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? Math.floor(limitRaw) : 50;

  const minMeanMsRaw = Number(c.req.query("minMeanMs"));
  const minMeanMs = Number.isFinite(minMeanMsRaw) && minMeanMsRaw >= 0 ? minMeanMsRaw : 0;

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const statements = await mainDb<
    {
      datname: string | null;
      usename: string | null;
      queryid: string;
      calls: string;
      total_exec_time_ms: number;
      mean_exec_time_ms: number;
      max_exec_time_ms: number;
      min_exec_time_ms: number;
      stddev_exec_time_ms: number;
      rows: string;
      query: string;
    }[]
  >`
SELECT d.datname,
       r.rolname AS usename,
       s.queryid::text AS queryid,
       s.calls::text AS calls,
       s.total_exec_time AS total_exec_time_ms,
       s.mean_exec_time AS mean_exec_time_ms,
       s.max_exec_time AS max_exec_time_ms,
       s.min_exec_time AS min_exec_time_ms,
       s.stddev_exec_time AS stddev_exec_time_ms,
       s.rows::text AS rows,
       s.query
FROM pg_stat_statements s
LEFT JOIN pg_database d ON d.oid = s.dbid
LEFT JOIN pg_roles r ON r.oid = s.userid
WHERE s.mean_exec_time >= ${minMeanMs}
ORDER BY ${mainDb(orderBy)} DESC
LIMIT ${limit}
`;

  return c.json({
    instanceName: _INSTANCE_NAME,
    serverTime: new Date().toISOString(),
    orderBy,
    limit,
    minMeanMs,
    statements,
  });
});

routesHealth.post("/pg_stat_statements_reset", async (c: Context) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`SELECT pg_stat_statements_reset()`;
  return c.json({ reset: true, serverTime: new Date().toISOString() });
});
