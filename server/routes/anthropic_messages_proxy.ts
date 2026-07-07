import type { Sql } from "postgres";
import {
  AddAiUsageLog,
  GetInstanceWeeklyTokenUsage,
  GetUserDailyTokenUsage,
  IncrementInstanceWeeklyTokenUsage,
  IncrementUserDailyTokenUsage,
  LogAiLimitHit,
} from "../db/mod.ts";
import {
  _ANTHROPIC_API_KEY,
  _ANTHROPIC_API_URL,
  _DAILY_TOKEN_LIMIT,
  _WEEKLY_TOKEN_LIMIT,
} from "../exposed_env_vars.ts";

// The ONE Anthropic /v1/messages passthrough, shared by the project proxy
// (mounted at /ai, per-project usage attribution) and the instance proxy
// (mounted at /ai-instance, null project_id; powers the HFA Indicator
// Manager assistant). Governance (daily-user + weekly-instance token
// limits), usage logging, and the beta-header policy live here so the two
// mounts cannot drift.
//
// Responses are Anthropic-shaped (including errors), NOT the APIResponse
// envelope — the browser Anthropic SDK parses them (see SYSTEM_13).

// Client-supplied anthropic-beta values (SDK >=0.110 sends betas via this
// header, not the body) are forwarded ONLY from this allowlist — the set
// panther actually uses. An open passthrough would let any authenticated
// user enable cost/behavior-changing betas (e.g. premium long-context
// pricing) under the same token limits.
const FORWARDABLE_BETAS = new Set([
  "web-fetch-2025-09-10",
  "files-api-2025-04-14",
  "structured-outputs-2025-12-15",
]);

type ProxyArgs = {
  // A thunk (not a value) so a malformed request body throws INSIDE the
  // try/catch below and returns an Anthropic-shaped error, rather than
  // escaping to app.onError (which would answer 200 with an APIResponse
  // envelope the client SDK can't parse).
  parseBody: () => Promise<{ stream?: boolean } & Record<string, unknown>>;
  clientBetaHeader: string | undefined;
  userEmail: string;
  unlimitedAi: boolean;
  projectId: string | null;
  mainDb: Sql;
};

export async function proxyAnthropicMessages(
  args: ProxyArgs,
): Promise<Response> {
  try {
    return await runProxy(args);
  } catch (err) {
    // Malformed request JSON or an upstream network failure. Keep the
    // Anthropic-shaped error contract (not the APIResponse envelope).
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { type: "error", error: { type: "api_error", message } },
      { status: 502 },
    );
  }
}

async function runProxy(args: ProxyArgs): Promise<Response> {
  const { clientBetaHeader, userEmail, unlimitedAi, projectId, mainDb } = args;
  const { stream = false, ...rest } = await args.parseBody();
  const model = typeof rest.model === "string" ? rest.model : "unknown";

  if (_DAILY_TOKEN_LIMIT !== null && !unlimitedAi) {
    const todayUsage = await GetUserDailyTokenUsage(mainDb, userEmail);
    if (todayUsage >= _DAILY_TOKEN_LIMIT) {
      LogAiLimitHit(mainDb, userEmail, "daily_user").catch(() => {});
      const resetAt = new Date();
      resetAt.setUTCDate(resetAt.getUTCDate() + 1);
      resetAt.setUTCHours(0, 0, 0, 0);
      return rateLimitResponse(
        `Rate limit: You have reached your daily AI token limit. Your usage will reset at ${resetAt.toISOString()}.`,
      );
    }
  }

  if (_WEEKLY_TOKEN_LIMIT !== null && !unlimitedAi) {
    const weeklyUsage = await GetInstanceWeeklyTokenUsage(mainDb);
    if (weeklyUsage >= _WEEKLY_TOKEN_LIMIT) {
      LogAiLimitHit(mainDb, "__instance__", "weekly_instance").catch(() => {});
      const nextMonday = new Date();
      const daysUntilMonday = (8 - nextMonday.getUTCDay()) % 7 || 7;
      nextMonday.setUTCDate(nextMonday.getUTCDate() + daysUntilMonday);
      nextMonday.setUTCHours(0, 0, 0, 0);
      return rateLimitResponse(
        `Rate limit: The country's weekly AI token limit has been reached. Usage will reset at ${nextMonday.toISOString()}.`,
      );
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": _ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };

  // Build beta headers based on features used. Prompt caching is GA — no
  // beta header needed. (cache_control just works.)
  const betaFeatures: string[] = [];

  // Files API for documents
  const hasDocuments = Array.isArray(rest.messages) &&
    rest.messages.some(
      (m: { content?: unknown }) =>
        Array.isArray(m.content) &&
        m.content.some((c: { type?: string }) => c.type === "document"),
    );
  if (hasDocuments) {
    betaFeatures.push("files-api-2025-04-14");
  }

  const clientBetas = (clientBetaHeader ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((b) => FORWARDABLE_BETAS.has(b));
  const allBetas = [...new Set([...betaFeatures, ...clientBetas])];
  if (allBetas.length > 0) {
    headers["anthropic-beta"] = allBetas.join(",");
  }

  const response = await fetch(_ANTHROPIC_API_URL, {
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
    let inputTokens = 0,
      outputTokens = 0,
      cacheReadTokens = 0,
      cacheCreationTokens = 0;
    let buffer = "";
    const decoder = new TextDecoder();

    // Log + increment exactly once per stream: flush() on graceful upstream
    // completion, cancel() when the client aborts mid-stream (Stop button,
    // tab close) — flush never runs on a cancelled pipe, and this path used
    // to record nothing. Cancel-path counts are partial (whatever events
    // arrived before the abort), which still undercounts what Anthropic
    // bills for the aborted generation — partial beats zero.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      AddAiUsageLog(
        mainDb,
        userEmail,
        projectId,
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
      ).catch(() => {});
      if (_DAILY_TOKEN_LIMIT !== null) {
        IncrementUserDailyTokenUsage(
          mainDb,
          userEmail,
          inputTokens + outputTokens,
        ).catch(() => {});
      }
      if (_WEEKLY_TOKEN_LIMIT !== null && !unlimitedAi) {
        IncrementInstanceWeeklyTokenUsage(
          mainDb,
          inputTokens + outputTokens,
        ).catch(() => {});
      }
    };

    // Deno's Transformer lib type predates the spec's transformer.cancel
    // hook, but the runtime honors it (verified: cancel fires and flush does
    // not when the readable side is cancelled) — hence the widened type.
    const transformer: Transformer<Uint8Array, Uint8Array> & {
      cancel?: (reason: unknown) => void;
    } = {
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "message_start" && event.message?.usage) {
                const u = event.message.usage;
                inputTokens = u.input_tokens ?? 0;
                cacheReadTokens = u.cache_read_input_tokens ?? 0;
                cacheCreationTokens = u.cache_creation_input_tokens ?? 0;
              } else if (event.type === "message_delta" && event.usage) {
                // message_delta.usage is CUMULATIVE for the whole response.
                // Server-tool turns (web search/fetch) run multiple internal
                // sampling iterations and only the delta carries the true
                // input totals — assign every non-null field, never add
                // (reading input from message_start alone misses all
                // server-tool iteration input; adding would double-count if
                // the API ever emits per-iteration deltas).
                const u = event.usage;
                if (u.input_tokens != null) inputTokens = u.input_tokens;
                if (u.output_tokens != null) outputTokens = u.output_tokens;
                if (u.cache_read_input_tokens != null) {
                  cacheReadTokens = u.cache_read_input_tokens;
                }
                if (u.cache_creation_input_tokens != null) {
                  cacheCreationTokens = u.cache_creation_input_tokens;
                }
              }
            } catch { /* not JSON, skip */ }
          }
        }
        controller.enqueue(chunk);
      },
      flush() {
        settle();
      },
      cancel() {
        settle();
      },
    };
    const transformStream = new TransformStream(transformer);

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
  AddAiUsageLog(
    mainDb,
    userEmail,
    projectId,
    model,
    inputTokens,
    outputTokens,
    u.cache_read_input_tokens ?? 0,
    u.cache_creation_input_tokens ?? 0,
  ).catch(() => {});
  if (_DAILY_TOKEN_LIMIT !== null) {
    IncrementUserDailyTokenUsage(
      mainDb,
      userEmail,
      inputTokens + outputTokens,
    ).catch(() => {});
  }
  if (_WEEKLY_TOKEN_LIMIT !== null && !unlimitedAi) {
    IncrementInstanceWeeklyTokenUsage(
      mainDb,
      inputTokens + outputTokens,
    ).catch(() => {});
  }
  return Response.json(data);
}

function rateLimitResponse(message: string): Response {
  return Response.json(
    { type: "error", error: { type: "rate_limit_error", message } },
    { status: 429 },
  );
}
