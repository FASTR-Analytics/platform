import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { APIResponseNoData } from "lib";
import type { UserLog } from "lib";

export async function AddLog(
    mainDb: Sql,
    user_email: string,
    endpoint: string,
    endpoint_result: string,
    details?: string,
    project_id?: string,
): Promise<APIResponseNoData> {
    return await tryCatchDatabaseAsync(async () => {
        await mainDb`
INSERT INTO user_logs
    (user_email, endpoint, endpoint_result, details, project_id)
VALUES
    (${user_email}, ${endpoint}, ${endpoint_result}, ${details ?? null}, ${project_id ?? null})
        `;
        return { success: true };
    });
}

export async function GetLogs(
    mainDb: Sql,
): Promise<APIResponseNoData & { data: UserLog[] }> {
    return await tryCatchDatabaseAsync(async () => {
        const logs: UserLog[] = await mainDb`
SELECT id, user_email, timestamp, endpoint, endpoint_result, details, project_id
FROM user_logs
ORDER BY timestamp DESC
        `;
        return { success: true, data: logs };
    });
}

export async function DeleteOldLogs(
    mainDb: Sql,
): Promise<APIResponseNoData> {
    return await tryCatchDatabaseAsync(async () => {
        await mainDb.begin(async (sql) => {
            await sql`
INSERT INTO user_logs_aggregate (user_email, endpoint, endpoint_result, project_id, week_start, count)
SELECT
    user_email,
    endpoint,
    endpoint_result,
    project_id,
    DATE_TRUNC('week', timestamp)::date AS week_start,
    COUNT(*) AS count
FROM user_logs
WHERE timestamp < NOW() - INTERVAL '7 days'
  AND endpoint != 'getCurrentUser'
GROUP BY user_email, endpoint, endpoint_result, project_id, DATE_TRUNC('week', timestamp)::date
ON CONFLICT (user_email, endpoint, endpoint_result, COALESCE(project_id, ''), week_start)
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

export async function GetLogsByProject(
    mainDb: Sql,
    project_id: string,
): Promise<APIResponseNoData & { data: UserLog[] }> {
    return await tryCatchDatabaseAsync(async () => {
        const logs: UserLog[] = await mainDb`
SELECT id, user_email, timestamp, endpoint, endpoint_result, details, project_id
FROM user_logs
WHERE project_id = ${project_id}
ORDER BY timestamp DESC
        `;
        return { success: true, data: logs };
    });
}