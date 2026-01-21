import { Sql } from "postgres";
import { tryCatchDatabaseAsync } from "./../utils.ts";
import { APIResponseNoData, APIResponseWithData } from "lib";
import { ProjectLog } from "../mod.ts";

export async function AddProjectLog(
    projectDb: Sql,
    user_email: string,
    endpoint: string,
    endpoint_result: string,
    project_id: string,
    details?: string,
): Promise<APIResponseNoData> {
    return tryCatchDatabaseAsync(async () =>{
        await projectDb`
INSERT INTO project_logs
    (user_email, endpoint, endpoint_result, project_id, details)
VALUES
    (${user_email}, ${endpoint}, ${endpoint_result}, ${project_id}, ${details ?? null})
        `;
        return ({ success: true });
    });
}

export async function GetProjectLogs(
    projectDb: Sql,
    project_id: string,
): Promise<APIResponseWithData<ProjectLog[]>> {
    return tryCatchDatabaseAsync(async () => {
        const logs: ProjectLog[] = await projectDb`
SELECT id, user_email, timestamp, endpoint, endpoint_result, details
FROM project_logs
WHERE project_id = ${project_id}
ORDER BY timestamp DESC`;
        return { success: true, data: logs };
    });
}