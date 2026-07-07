import { Hono } from "hono";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { AddAiUsageLog, GetInstanceWeeklyTokenUsage, IncrementInstanceWeeklyTokenUsage, GetUserDailyTokenUsage, IncrementUserDailyTokenUsage, LogAiLimitHit } from "../../db/mod.ts";
import { _DAILY_TOKEN_LIMIT, _WEEKLY_TOKEN_LIMIT } from "../../exposed_env_vars.ts";

export const routesInstanceAiProxy = new Hono();

// Instance-level AI proxy — the same passthrough as the project proxy
// (routes/project/ai_proxy.ts), but guarded at instance level and not tied to a
// project. Powers the self-contained HFA Indicator Manager assistant. Usage is
// logged with a null project_id; token limits are already user/instance-scoped.
routesInstanceAiProxy.post("/v1/messages", requireGlobalPermission("can_configure_data"), async (c) => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return c.json({ error: { message: "API key not configured" } }, 500);
  }

  const body = await c.req.json();
  const { stream = false, ...rest } = body;

  const userEmail = c.var.globalUser.email;
  const mainDb = c.var.mainDb;

  if (_DAILY_TOKEN_LIMIT !== null && !c.var.globalUser.unlimitedAi) {
    const todayUsage = await GetUserDailyTokenUsage(mainDb, userEmail);
    if (todayUsage >= _DAILY_TOKEN_LIMIT) {
      LogAiLimitHit(mainDb, userEmail, "daily_user").catch(() => {});
      const resetAt = new Date();
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      resetAt.setUTCHours(0, 0, 0, 0);
      return c.json({ type: "error", error: { type: "rate_limit_error", message: `Rate limit: You have reached your daily AI token limit. Your usage will reset at ${resetAt.toISOString()}.` } }, 429);
    }
  }

  if (_WEEKLY_TOKEN_LIMIT !== null && !c.var.globalUser.unlimitedAi) {
    const weeklyUsage = await GetInstanceWeeklyTokenUsage(mainDb);
    if (weeklyUsage >= _WEEKLY_TOKEN_LIMIT) {
      LogAiLimitHit(mainDb, "__instance__", "weekly_instance").catch(() => {});
      const nextMonday = new Date();
      const daysUntilMonday = (8 - nextMonday.getUTCDay()) % 7 || 7;
      nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
      nextMonday.setUTCHours(0, 0, 0, 0);
      return c.json({ type: "error", error: { type: "rate_limit_error", message: `Rate limit: The country's weekly AI token limit has been reached. Usage will reset at ${nextMonday.toISOString()}.` } }, 429);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const betaFeatures: string[] = [];

  if (
    stream ||
    rest.system?.some?.(
      (block: { cache_control?: unknown }) => block.cache_control,
    )
  ) {
    betaFeatures.push("prompt-caching-2024-07-31");
  }

  const hasDocuments = rest.messages?.some(
    (m: { content?: unknown }) =>
      Array.isArray(m.content) &&
      m.content.some((c: { type?: string }) => c.type === "document"),
  );
  if (hasDocuments) {
    betaFeatures.push("files-api-2025-04-14");
  }

  // Forward any beta flags the panther SDK set (e.g. files-api) alongside the
  // ones computed here, so SDK-gated features work without a proxy change.
  // Safe: this endpoint is authenticated and panther is the only client.
  const clientBetas = (c.req.header("anthropic-beta") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const allBetas = [...new Set([...betaFeatures, ...clientBetas])];
  if (allBetas.length > 0) {
    headers["anthropic-beta"] = allBetas.join(",");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...rest, stream }),
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(
      JSON.stringify({
        error: `Anthropic API error: ${response.status} - ${error}`,
      }),
      {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (stream) {
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
        AddAiUsageLog(mainDb, userEmail, null, rest.model,
          inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
        ).catch(() => {});
        if (_DAILY_TOKEN_LIMIT !== null) {
          IncrementUserDailyTokenUsage(mainDb, userEmail, inputTokens + outputTokens).catch(() => {});
        }
        if (_WEEKLY_TOKEN_LIMIT !== null && !c.var.globalUser.unlimitedAi) {
          IncrementInstanceWeeklyTokenUsage(mainDb, inputTokens + outputTokens).catch(() => {});
        }
      },
    });

    return new Response(response.body!.pipeThrough(transformStream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await response.json();
  const u = data.usage ?? {};
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  AddAiUsageLog(mainDb, userEmail, null, rest.model,
    inputTokens, outputTokens,
    u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0,
  ).catch(() => {});
  if (_DAILY_TOKEN_LIMIT !== null) {
    IncrementUserDailyTokenUsage(mainDb, userEmail, inputTokens + outputTokens).catch(() => {});
  }
  if (_WEEKLY_TOKEN_LIMIT !== null && !c.var.globalUser.unlimitedAi) {
    IncrementInstanceWeeklyTokenUsage(mainDb, inputTokens + outputTokens).catch(() => {});
  }
  return c.json(data);
});
