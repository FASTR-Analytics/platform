import { Hono } from "hono";
import { getGlobalNonAdmin, getProjectViewer } from "../../project_auth.ts";

export const routesAiProxy = new Hono();

// Unified AI proxy - client passes system prompt in request body
routesAiProxy.post(
  "/v1/messages",
  getGlobalNonAdmin,
  getProjectViewer,
  async (c) => {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return c.json({ error: { message: "API key not configured" } }, 500);
    }

    const body = await c.req.json();
    const { stream = false, ...rest } = body;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };

    // Add beta header for prompt caching if needed
    if (stream || rest.system?.some?.((block: { cache_control?: unknown }) => block.cache_control)) {
      headers["anthropic-beta"] = "prompt-caching-2024-07-31";
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...rest, stream }),
    });

    if (!response.ok) {
      const error = await response.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${response.status} - ${error}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    if (stream) {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    const data = await response.json();
    return c.json(data);
  }
);
