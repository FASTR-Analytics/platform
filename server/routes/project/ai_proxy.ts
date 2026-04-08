import { Hono } from "hono";
import { requireProjectPermission } from "../../project_auth.ts";
import { AddAiUsageLog } from "../../db/mod.ts";

export const routesAiProxy = new Hono();

// Unified AI proxy - client passes system prompt in request body
routesAiProxy.post("/v1/messages", requireProjectPermission(), async (c) => {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return c.json({ error: { message: "API key not configured" } }, 500);
  }

  const body = await c.req.json();
  const { stream = false, ...rest } = body;

  const userEmail = c.var.globalUser.email;
  const projectId = c.var.ppk.projectId;
  const mainDb = c.var.mainDb;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  // Build beta headers based on features used
  const betaFeatures: string[] = [];

  // Prompt caching
  if (
    stream ||
    rest.system?.some?.(
      (block: { cache_control?: unknown }) => block.cache_control,
    )
  ) {
    betaFeatures.push("prompt-caching-2024-07-31");
  }

  // Files API for documents
  const hasDocuments = rest.messages?.some(
    (m: { content?: unknown }) =>
      Array.isArray(m.content) &&
      m.content.some((c: { type?: string }) => c.type === "document"),
  );
  if (hasDocuments) {
    betaFeatures.push("files-api-2025-04-14");
  }

  if (betaFeatures.length > 0) {
    headers["anthropic-beta"] = betaFeatures.join(",");
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
  }

  const data = await response.json();
  const u = data.usage ?? {};
  AddAiUsageLog(mainDb, userEmail, projectId, rest.model,
    u.input_tokens ?? 0, u.output_tokens ?? 0,
    u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0,
  ).catch(() => {});
  return c.json(data);
});
