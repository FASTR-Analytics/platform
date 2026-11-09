import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { APIResponseNoData } from "lib";

// Also stamps users.last_active_at, at most once a minute per user: the Users
// tab shows it to the minute, and the row is read on every request.
export async function AddLog(
  mainDb: Sql,
  user_email: string,
  endpoint: string,
  endpoint_result: string,
  details?: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb`
WITH logged AS (
  INSERT INTO user_logs
      (user_email, endpoint, endpoint_result, details)
  VALUES
      (${user_email}, ${endpoint}, ${endpoint_result}, ${details ?? null})
  RETURNING user_email, timestamp
)
UPDATE users
SET last_active_at = logged.timestamp
FROM logged
WHERE users.email = logged.user_email
  AND (users.last_active_at IS NULL
    OR users.last_active_at < logged.timestamp - INTERVAL '1 minute')
        `;
    return { success: true };
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
