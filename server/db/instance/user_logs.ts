import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  parseJsonOrUndefined,
  type UserLastActive,
} from "lib";

export async function AddLog(
  mainDb: Sql,
  user_email: string,
  endpoint: string,
  endpoint_result: string,
  details?: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
INSERT INTO user_logs
    (user_email, endpoint, endpoint_result, details)
VALUES
    (${user_email}, ${endpoint}, ${endpoint_result}, ${details ?? null})
        `;
    return { success: true };
  });
}

export async function getUsersLastActive(
  mainDb: Sql,
): Promise<APIResponseWithData<UserLastActive[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{ email: string; last_active: Date }[]>`
      SELECT user_email AS email, MAX(timestamp) AS last_active
      FROM user_logs
      GROUP BY user_email
    `;
    return {
      success: true,
      data: rows.map((r) => ({
        email: r.email,
        lastActive: r.last_active.toISOString(),
      })),
    };
  });
}

export type RecentUserRequest = {
  at: string;
  endpoint: string;
  status: string;
  params: Record<string, string>;
};

// One user's own logged requests since `since`, oldest first: endpoint, HTTP
// status and route params (ids) only, never the request body. The feedback
// planner hands these to the model as evidence about what the reporter did.
export async function getRecentUserRequests(
  mainDb: Sql,
  userEmail: string,
  since: Date,
  limit: number,
): Promise<APIResponseWithData<RecentUserRequest[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<{
      timestamp: Date;
      endpoint: string;
      endpoint_result: string;
      details: string | null;
    }[]>`
      SELECT timestamp, endpoint, endpoint_result, details
      FROM user_logs
      WHERE user_email = ${userEmail}
        AND timestamp > ${since}
        AND endpoint NOT IN ('getCurrentUser', 'sendHelpEmail')
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;
    return {
      success: true,
      data: rows.reverse().map((r) => {
        const raw = parseJsonOrUndefined<{ params?: unknown }>(r.details)
          ?.params;
        const params: Record<string, string> = {};
        if (raw && typeof raw === "object") {
          for (const [k, v] of Object.entries(raw)) {
            if (typeof v === "string") params[k] = v.slice(0, 100);
          }
        }
        return {
          at: r.timestamp.toISOString(),
          endpoint: r.endpoint,
          status: r.endpoint_result,
          params,
        };
      }),
    };
  });
}

export async function DeleteOldLogs(
  mainDb: Sql,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      await sql`
INSERT INTO user_logs_aggregate (user_email, endpoint, endpoint_result, week_start, count)
SELECT
    user_email,
    endpoint,
    endpoint_result,
    DATE_TRUNC('week', timestamp)::date AS week_start,
    COUNT(*) AS count
FROM user_logs
WHERE timestamp < NOW() - INTERVAL '7 days'
  AND endpoint != 'getCurrentUser'
GROUP BY user_email, endpoint, endpoint_result, DATE_TRUNC('week', timestamp)::date
ON CONFLICT (user_email, endpoint, endpoint_result, week_start)
DO UPDATE SET count = user_logs_aggregate.count + EXCLUDED.count
            `;
      await sql`
DELETE FROM user_logs
WHERE timestamp < NOW() - INTERVAL '7 days'
  AND endpoint != 'getCurrentUser'
            `;
    });
    return { success: true };
  });
}
