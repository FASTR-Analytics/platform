import { Sql } from "postgres";
import { AiUsageLog } from "./_main_database_types.ts";

export async function AddAiUsageLog(
    mainDb: Sql,
    user_email: string,
    project_id: string,
    model: string,
    input_tokens: number,
    output_tokens: number,
    cache_read_input_tokens: number,
    cache_creation_input_tokens: number,
): Promise<void> {
    await mainDb`
INSERT INTO ai_usage_logs
    (user_email, project_id, model, input_tokens, output_tokens,
     cache_read_input_tokens, cache_creation_input_tokens)
VALUES
    (${user_email}, ${project_id}, ${model}, ${input_tokens}, ${output_tokens},
     ${cache_read_input_tokens}, ${cache_creation_input_tokens})
    `;
}

export async function GetAiUsageLogs(mainDb: Sql, since?: string): Promise<AiUsageLog[]> {
    if (since) {
        return await mainDb<AiUsageLog[]>`
SELECT * FROM ai_usage_logs WHERE timestamp >= ${since} ORDER BY timestamp DESC
        `;
    }
    return await mainDb<AiUsageLog[]>`
SELECT * FROM ai_usage_logs ORDER BY timestamp DESC
    `;
}
