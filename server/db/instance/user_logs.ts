import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
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
