import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { APIResponseNoData } from "lib";
import { UserLog } from "../mod.ts";

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

export async function GetLogs(
    mainDb: Sql,
): Promise<APIResponseNoData & { data: UserLog[] }> {
    return await tryCatchDatabaseAsync(async () => {
        const logs: UserLog[] = await mainDb`
SELECT id, user_email, timestamp, endpoint, endpoint_result, details
FROM user_logs
ORDER BY timestamp DESC
        `;
        return { success: true, data: logs };
    });
}