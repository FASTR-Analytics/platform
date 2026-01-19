import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { APIResponseNoData } from "lib";

export async function AddLog(
    mainDb: Sql,
    user_email: string,
    endpoint: string,
    endpoint_result: string,
    details: string,
): Promise<APIResponseNoData> {
    return await tryCatchDatabaseAsync(async () => {
        await mainDb`
INSERT INTO user_logs
    (user_email, endpoint, endpoint_result)
VALUES
    (${user_email}, ${endpoint}, ${endpoint_result})
        `;
        return { success: true };
    });
}