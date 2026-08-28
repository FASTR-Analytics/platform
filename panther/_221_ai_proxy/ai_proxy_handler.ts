// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The AI proxy (graduated from the panterra lab): panther's browser AI
// client points at baseURL <pathPrefix> and POSTs to
// <pathPrefix>/v1/messages; this handler forwards to Anthropic with the
// server-held key (never shipped to the browser) and streams the SSE
// response straight back. Guarded like every off-contract door: the client
// attaches the same per-request credential the op client carries, judged
// through the _113 seam (401/403/503 as the JSON envelope).
//
// It also SANITIZES the request to the current model surface — the point of
// centralizing: model-surface churn updates ONCE here. The stated cost:
// each model bump is a panther commit + fleet re-sync, accepted because the
// churn is fleet-wide by nature. Current surface (Opus 4.8 per the
// claude-api reference): temperature/top_p/top_k are rejected, and
// budget-token thinking maps to adaptive.

import { guardedHandler } from "./deps.ts";
import type { Guard, IdentityProvider } from "./deps.ts";

const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com";
const DEFAULT_PATH_PREFIX = "/api/ai";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export type AIProxyHandlerConfig<TIdentity> = {
  // The server-held key. Empty/missing answers 500 per request (an
  // Anthropic-shaped error body the SDK client surfaces readably) rather
  // than refusing to boot: the proxy is one route of a larger app.
  apiKey: string;
  provider: IdentityProvider<TIdentity>;
  guard: Guard<TIdentity>;
  // Must match where the app mounts the handler. Default "/api/ai".
  pathPrefix?: string;
  // Overridable for gateways/test rigs. Default the Anthropic API.
  anthropicBaseUrl?: string;
  // Injectable for tests.
  fetchFn?: typeof fetch;
};

export function createAIProxyHandler<TIdentity>(
  config: AIProxyHandlerConfig<TIdentity>,
): (req: Request) => Promise<Response> {
  const pathPrefix = config.pathPrefix ?? DEFAULT_PATH_PREFIX;
  const base = config.anthropicBaseUrl ?? DEFAULT_ANTHROPIC_BASE;
  const fetchFn = config.fetchFn ?? fetch;

  return guardedHandler(config.provider, config.guard, async (req) => {
    // The segment boundary is a security property, not tidiness: it pins the
    // upstream authority to `base` (a prefix-adjacent path like
    // "/api/aifoo.evil.com/..." would otherwise splice into the upstream host).
    const url = new URL(req.url);
    if (
      url.pathname !== pathPrefix &&
      !url.pathname.startsWith(`${pathPrefix}/`)
    ) {
      return Response.json({ success: false, err: "Unknown path" }, {
        status: 404,
      });
    }
    if (!config.apiKey) {
      return Response.json({
        type: "error",
        error: {
          type: "authentication_error",
          message: "ANTHROPIC_API_KEY is not configured on the server",
        },
      }, { status: 500 });
    }

    const upstreamPath = url.pathname.slice(pathPrefix.length);
    const upstreamUrl = base + upstreamPath + url.search;

    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-api-key", config.apiKey);
    headers.set(
      "anthropic-version",
      req.headers.get("anthropic-version") ?? DEFAULT_ANTHROPIC_VERSION,
    );
    const beta = req.headers.get("anthropic-beta");
    if (beta !== null) {
      headers.set("anthropic-beta", beta);
    }

    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const raw = await req.text();
      body = raw;
      try {
        body = JSON.stringify(sanitizeRequest(JSON.parse(raw)));
      } catch {
        // not JSON — forward unchanged
      }
    }

    const upstream = await fetchFn(upstreamUrl, {
      method: req.method,
      headers,
      body,
    });

    // Stream the response (SSE or JSON) straight back to the browser client.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ??
          "application/json",
      },
    });
  });
}

// Strip parameters the current model rejects, so a client model-config
// built against an older surface can't trigger a 400.
function sanitizeRequest(b: unknown): unknown {
  if (!b || typeof b !== "object") {
    return b;
  }
  const out = { ...(b as Record<string, unknown>) };
  delete out.temperature;
  delete out.top_p;
  delete out.top_k;
  const thinking = out.thinking as { type?: string } | undefined;
  if (thinking && thinking.type === "enabled") {
    out.thinking = { type: "adaptive" };
  }
  return out;
}
