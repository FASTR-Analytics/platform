import { Sql } from "postgres";
import { AiUsageLog } from "./_main_database_types.ts";

export async function GetInstanceWeeklyTokenUsage(mainDb: Sql): Promise<number> {
  const result = await mainDb<[{ total_tokens: number }]>`
    SELECT COALESCE(total_tokens, 0) AS total_tokens
    FROM instance_weekly_token_usage
    WHERE week_start = date_trunc('week', CURRENT_DATE)::date
  `;
  return result[0]?.total_tokens ?? 0;
}

export async function IncrementInstanceWeeklyTokenUsage(mainDb: Sql, tokens: number): Promise<void> {
  await mainDb`
    INSERT INTO instance_weekly_token_usage (week_start, total_tokens)
    VALUES (date_trunc('week', CURRENT_DATE)::date, ${tokens})
    ON CONFLICT (week_start) DO UPDATE
    SET total_tokens = instance_weekly_token_usage.total_tokens + ${tokens}
  `;
}

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

export async function LogAiLimitHit(mainDb: Sql, userEmail: string, limitType: "daily_user" | "weekly_instance"): Promise<void> {
  await mainDb`
    INSERT INTO ai_limit_hits (user_email, limit_type, hit_date)
    VALUES (${userEmail}, ${limitType}, CURRENT_DATE)
    ON CONFLICT DO NOTHING
  `;
}

export async function GetAiLimitHits(mainDb: Sql, since?: string): Promise<{ user_email: string; limit_type: string; hit_date: string }[]> {
  if (since) {
    return await mainDb<{ user_email: string; limit_type: string; hit_date: string }[]>`
      SELECT user_email, limit_type, hit_date::text FROM ai_limit_hits WHERE hit_date >= ${since} ORDER BY hit_date DESC
    `;
  }
  return await mainDb<{ user_email: string; limit_type: string; hit_date: string }[]>`
    SELECT user_email, limit_type, hit_date::text FROM ai_limit_hits ORDER BY hit_date DESC
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
