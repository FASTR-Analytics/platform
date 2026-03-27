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

routesHealth.get("/projects", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const projects = await mainDb<{ label: string }[]>`SELECT label FROM projects ORDER BY LOWER(label)`;
  return c.json({ projects: projects.map((p) => p.label) });
});

routesHealth.get("/user_logs", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const logs = await mainDb<UserLog[]>`SELECT user_email, endpoint, timestamp FROM user_logs WHERE endpoint = 'getInstanceDetail' ORDER BY timestamp DESC`;
  return c.json({ logs });
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

routesHealth.get("/changelog", async (c) => {
  try {
    const text = await Deno.readTextFile("./CHANGELOG.md");
    return c.text(text);
  } catch {
    return c.text("", 404);
  }
});
