# Plan: Track AI Chatbot Token Usage per User

## Context

The platform proxies all chatbot requests through `server/routes/project/ai_proxy.ts`. Currently there is no record of how many tokens each user consumes. The goal is to capture Anthropic API token usage on every request and store it in the main database, expose it via a new endpoint in `health.ts`, and then calculate costs on the admin website using LiteLLM pricing data.

---

## Files to Create/Modify (Platform)

| File                                                      | Action                            |
|-----------------------------------------------------------|-----------------------------------|
| `server/db/migrations/instance/012_add_ai_usage_logs.sql` | Create (new migration)            |
| `server/db/instance/_main_database.sql`                   | Update (add table definition)     |
| `server/db/instance/_main_database_types.ts`              | Update (add `AiUsageLog` type)    |
| `server/db/instance/ai_usage_logs.ts`                     | Create (new DB access module)     |
| `server/db/instance/mod.ts`                               | Update (export new module)        |
| `server/routes/project/ai_proxy.ts`                       | Update (capture and log usage)    |
| `server/routes/instance/health.ts`                        | Update (add `/ai_usage` endpoint) |

---

## Step 1 — Migration: `012_add_ai_usage_logs.sql`

```sql
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_email text NOT NULL,
  project_id text,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_email ON ai_usage_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_id ON ai_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_timestamp ON ai_usage_logs(timestamp DESC);
```

Also add this table to `_main_database.sql` (canonical schema, kept in sync with migrations).

---

## Step 2 — Type: `_main_database_types.ts`

Add alongside `UserLog`, following the same pattern:

```typescript
export type AiUsageLog = {
  id: number;
  timestamp: Date;
  user_email: string;
  project_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};
```

---

## Step 3 — DB access module: `server/db/instance/ai_usage_logs.ts`

Two functions following the pattern in `user_logs.ts`:

```typescript
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

export async function GetAiUsageLogs(mainDb: Sql): Promise<AiUsageLog[]> {
  return await mainDb<AiUsageLog[]>`
    SELECT * FROM ai_usage_logs ORDER BY timestamp DESC
  `;
}
```

Export from `server/db/instance/mod.ts`:

```typescript
export * from "./ai_usage_logs.ts";
```

---

## Step 4 — Expose via `health.ts`

Add a new route following the same no-auth pattern as existing routes in that file:

```typescript
routesHealth.get("/ai_usage", async (c) => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_ONLY");
  const logs = await GetAiUsageLogs(mainDb);
  return c.json({ logs });
});
```

Import `GetAiUsageLogs` and `AiUsageLog` from `"../../db/mod.ts"`.

---

## Step 5 — Update `ai_proxy.ts`

Get context at the start of the handler:

```typescript
const userEmail = c.var.globalUser.email;
const projectId = c.var.ppk.projectId;
const mainDb = c.var.mainDb;
```

**Non-streaming path** — after `response.json()`, fire-and-forget log:

```typescript
const data = await response.json();
const u = data.usage ?? {};
AddAiUsageLog(mainDb, userEmail, projectId, rest.model,
  u.input_tokens ?? 0, u.output_tokens ?? 0,
  u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0,
).catch(() => {});
return c.json(data);
```

**Streaming path** — wrap `response.body` in a `TransformStream` that intercepts SSE lines, accumulates token counts from `message_start` and `message_delta` events, then logs on `flush`:

```typescript
let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0;
let buffer = "";
const decoder = new TextDecoder();

const transformStream = new TransformStream({
  transform(chunk, controller) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "message_start" && event.message?.usage) {
            inputTokens += event.message.usage.input_tokens ?? 0;
            cacheReadTokens += event.message.usage.cache_read_input_tokens ?? 0;
            cacheCreationTokens += event.message.usage.cache_creation_input_tokens ?? 0;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens += event.usage.output_tokens ?? 0;
          }
        } catch { /* not JSON, skip */ }
      }
    }
    controller.enqueue(chunk);
  },
  flush() {
    AddAiUsageLog(mainDb, userEmail, projectId, rest.model,
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
    ).catch(() => {});
  },
});

return new Response(response.body!.pipeThrough(transformStream), {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  },
});
```

---

## Admin website: cost calculation

### 1. Fetch token rows

```
GET {platform_url}/health/ai_usage
→ { logs: AiUsageLog[] }
```

### 2. Fetch LiteLLM pricing JSON

```
GET https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
```

Keep a local bundled fallback copy to use if the GitHub fetch fails (e.g. in network-restricted deployments).

### 3. Calculate cost per row

```typescript
function computeCost(log: AiUsageLog, pricing: Record<string, ModelPricing>): number {
  const p = pricing[log.model];
  if (!p) return 0;
  return (log.input_tokens * (p.input_cost_per_token ?? 0))
       + (log.output_tokens * (p.output_cost_per_token ?? 0))
       + (log.cache_creation_input_tokens * (p.cache_creation_input_token_cost ?? 0))
       + (log.cache_read_input_tokens * (p.cache_read_input_token_cost ?? 0));
}
```

LiteLLM uses bare Anthropic model IDs as keys (e.g. `claude-sonnet-4-5-20250929`), matching what the platform stores.

### 4. Aggregate as needed

- Total cost per user: group by `user_email`, sum costs
- Total cost per project: group by `project_id`, sum costs
- Total cost per period: group by day/month using `timestamp`

---

## Verification

1. Make a non-streaming chatbot request → `SELECT * FROM ai_usage_logs ORDER BY timestamp DESC LIMIT 1`
2. Make a streaming chatbot request → same check
3. Verify all four token counts are non-zero and plausible
4. Verify `user_email` and `project_id` are correctly set
5. Call `GET /health/ai_usage` → confirm rows returned as `{ logs: [...] }`
6. On admin website, apply pricing JSON to a row and confirm cost looks reasonable
