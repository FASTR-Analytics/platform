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

    // Build beta headers based on features used
    const betaFeatures: string[] = [];

    // Prompt caching
    if (stream || rest.system?.some?.((block: { cache_control?: unknown }) => block.cache_control)) {
      betaFeatures.push("prompt-caching-2024-07-31");
    }

    // Files API for documents
    const hasDocuments = rest.messages?.some(
      (m: { content?: unknown }) =>
        Array.isArray(m.content) &&
        m.content.some((c: { type?: string }) => c.type === "document")
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
