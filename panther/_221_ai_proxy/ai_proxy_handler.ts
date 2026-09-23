// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The AI proxy (graduated from the panterra lab): panther's browser AI
// client points at baseURL <pathPrefix> and POSTs to
// <pathPrefix>/v1/messages; this handler forwards that one endpoint to
// Anthropic with the server-held key (never shipped to the browser) and
// streams the SSE response straight back. Guarded like every off-contract
// door: the client attaches the same per-request credential the op client
// carries, judged through the _113 seam (401/403/503 as the JSON envelope).
//
// It also SANITIZES the request per model, with the same _110 helpers the
// browser client resolves with, so a client built against an older model
// surface can't 400. Client and proxy share one policy by construction:
// a model bump is edited once, in _110, and reaches both on the next sync.

import {
  guardedHandler,
  resolveOutputConfig,
  resolveThinkingConfig,
  supportsSamplingParams,
} from "./deps.ts";
import type {
  Guard,
  IdentityProvider,
  OutputConfig,
  ThinkingConfig,
} from "./deps.ts";

const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com";
const DEFAULT_PATH_PREFIX = "/api/ai";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

// The server key reaches only the endpoints the chat client uses. Every
// SDK call panther makes (stream, create, parse, toolRunner) is a POST to
// /v1/messages; files, models, batches, and count_tokens stay unreachable
// until a consumer needs one.
const PROXIED_POST_PATHS = ["/v1/messages"];

// Response headers the SDK client reads for retry decisions (x-should-retry,
// retry-after, retry-after-ms) and logs (request-id), plus the rate-limit
// headers for the app or a human debugging. Everything else upstream sends
// stays behind the proxy.
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "retry-after-ms",
  "request-id",
  "x-should-retry",
];
const FORWARDED_RESPONSE_HEADER_PREFIXES = ["anthropic-ratelimit-"];

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
    const upstreamPath = url.pathname.slice(pathPrefix.length);
    if (req.method !== "POST" || !PROXIED_POST_PATHS.includes(upstreamPath)) {
      return Response.json({ success: false, err: "Endpoint not proxied" }, {
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

    const raw = await req.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }
    // Only the parse is guarded: a sanitizer failure must surface, never
    // forward the body unsanitized.
    const body = parsed === undefined
      ? raw
      : JSON.stringify(sanitizeRequest(parsed));

    let upstream: Response;
    try {
      // The client's signal rides along so a Stop pressed before the first
      // byte cancels the upstream generation instead of billing it in full.
      upstream = await fetchFn(upstreamUrl, {
        method: "POST",
        headers,
        body,
        signal: req.signal,
      });
    } catch (err) {
      // The error text can carry the upstream URL (a gateway configured via
      // anthropicBaseUrl); it goes to the server log, not the browser. A
      // client that aborted before the first byte is not an upstream failure.
      if (!req.signal.aborted) {
        console.error("AI proxy upstream failure:", err);
      }
      return Response.json({
        type: "error",
        error: { type: "api_error", message: "Upstream request failed" },
      }, { status: 502 });
    }

    // Stream the response (SSE or JSON) straight back to the browser client.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: forwardedResponseHeaders(upstream.headers),
    });
  });
}

function forwardedResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const [name, value] of upstream) {
    if (
      FORWARDED_RESPONSE_HEADERS.includes(name) ||
      FORWARDED_RESPONSE_HEADER_PREFIXES.some((p) => name.startsWith(p))
    ) {
      out.set(name, value);
    }
  }
  if (!out.has("content-type")) {
    out.set("content-type", "application/json");
  }
  return out;
}

// Drop or clamp parameters the request's model rejects. Keyed on
// `body.model`; a body without a string model is forwarded untouched
// (the API's own validation answers it). A model ID outside _110's prefix
// lists keeps sampling params and manual or disabled thinking and loses
// adaptive thinking and effort, exactly as in the browser client.
function sanitizeRequest(b: unknown): unknown {
  if (!b || typeof b !== "object") {
    return b;
  }
  const out = { ...(b as Record<string, unknown>) };
  const model = out.model;
  if (typeof model !== "string") {
    return out;
  }
  if (!supportsSamplingParams(model)) {
    delete out.temperature;
    delete out.top_p;
    delete out.top_k;
  }
  const thinking = resolveThinkingConfig(
    model,
    out.thinking as ThinkingConfig | undefined,
  );
  if (thinking === undefined) {
    delete out.thinking;
  } else {
    out.thinking = thinking;
  }
  const rawOutputConfig = out.output_config;
  if (rawOutputConfig && typeof rawOutputConfig === "object") {
    // Only `effort` is policy; other output_config keys pass through.
    const { effort: _effort, ...rest } = rawOutputConfig as OutputConfig;
    const resolved = {
      ...rest,
      ...resolveOutputConfig(model, rawOutputConfig as OutputConfig, thinking),
    };
    if (Object.keys(resolved).length === 0) {
      delete out.output_config;
    } else {
      out.output_config = resolved;
    }
  }
  return out;
}
