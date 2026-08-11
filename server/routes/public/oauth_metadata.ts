import { Hono } from "hono";
import { _CLERK_PUBLISHABLE_KEY } from "../../exposed_env_vars.ts";

// OAuth discovery for the /mcp endpoint (PLAN_MCP_OAUTH).
//
// These are the documents an OAuth-capable MCP client (claude.ai custom
// connectors, Claude Desktop) fetches to learn that /mcp is a protected
// resource and WHICH authorization server guards it. They must be reachable
// WITHOUT credentials — they are the thing a client reads *before* it has any.
// main.ts therefore registers them ahead of the global Clerk middleware, next
// to the public dashboard routes.
//
// FASTR is only the resource server here. Clerk is the authorization server:
// it owns /authorize, /token and (with dynamic client registration enabled)
// /oauth/register. Nothing in this file issues or validates a token; the
// credential is judged in server/headless_auth.ts.
//
// The generators are inlined rather than taken from @clerk/mcp-tools: the whole
// job is ~40 lines of RFC 9728 / RFC 8414 shapes, and the 0.x dependency would
// buy nothing.

export const routesOAuthMetadata = new Hono();

// A client fetches these cross-origin from its own web app, and they carry no
// credentials by design, so a wildcard origin is correct and safe.
const METADATA_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

// The Clerk Frontend API host is encoded in the publishable key:
// pk_(test|live)_<base64(host + "$")>. This is how the instance's authorization
// server URL is derived without a second env var that could drift out of sync
// with the key actually in use.
function frontendApiUrlFromPublishableKey(
  publishableKey: string,
): string | null {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  if (encoded === publishableKey || encoded === "") {
    return null;
  }
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }
  const host = decoded.endsWith("$") ? decoded.slice(0, -1) : decoded;
  if (!host || !/^[A-Za-z0-9.-]+$/.test(host)) {
    return null;
  }
  return `https://${host}`;
}

function authorizationServerUrl(): string | null {
  return frontendApiUrlFromPublishableKey(_CLERK_PUBLISHABLE_KEY);
}

// The instance's public origin, taken from the REQUEST rather than configured:
// every FASTR instance serves on its own hostname, CLIENT_ORIGIN is a CORS
// allowlist (on testing2 it is still the localhost default) and cannot stand in
// for it, and a hardcoded value would be wrong on all but one instance.
//
// The scheme comes from X-Forwarded-Proto because TLS is terminated at the
// proxy — Deno itself sees plain http, and an http:// metadata URL is one an
// OAuth client will refuse. Both this header and Host are ultimately caller
// influenced, which is acceptable here precisely because the derived value only
// ever appears in the response to that same caller: it is never stored, never
// cached across callers, and never sent anywhere else.
//
// ONE derivation, exported, used by BOTH the metadata document below and the
// /mcp 401 challenge (server/mcp/mcp_endpoint.ts). RFC 9728 ties the pointer to
// the resource identifier, so if these two ever disagreed the discovery would
// be broken in a way neither side could detect alone.
export function publicOriginFromRequest(req: Request): string {
  const url = new URL(req.url);
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "https" || forwarded === "http") {
    url.protocol = `${forwarded}:`;
  }
  return url.origin;
}

export function mcpResourceMetadataUrl(req: Request): string {
  return `${
    publicOriginFromRequest(req)
  }/.well-known/oauth-protected-resource/mcp`;
}

function mcpResourceUrl(req: Request): string {
  return `${publicOriginFromRequest(req)}/mcp`;
}

function metadataResponse(body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json", ...METADATA_CORS },
  });
}

function unavailableResponse(): Response {
  // 503, not 404: the endpoint exists, the instance is just not configured to
  // advertise an authorization server. A 404 would tell a client this server
  // does not do OAuth at all, which is a different (and stickier) conclusion.
  return new Response(
    JSON.stringify({ error: "oauth metadata unavailable" }),
    {
      status: 503,
      headers: { "content-type": "application/json", ...METADATA_CORS },
    },
  );
}

// RFC 9728 §3 — protected resource metadata.
//
// Two paths, one document. The spec-correct location for the resource
// https://host/mcp is /.well-known/oauth-protected-resource/mcp, and that is
// what the /mcp 401 challenge points at; the bare path is served too because
// clients differ on which they probe and answering both costs nothing.
function protectedResourceMetadata(req: Request): Response {
  const authServer = authorizationServerUrl();
  if (authServer === null) {
    return unavailableResponse();
  }
  return metadataResponse({
    resource: mcpResourceUrl(req),
    authorization_servers: [authServer],
    bearer_methods_supported: ["header"],
    // What the consent screen should ask for. Identity only: FASTR authorizes
    // against the user's OWN permissions after resolving the token to an
    // email, so there is no FASTR-specific scope to grant.
    scopes_supported: ["profile", "email"],
  });
}

routesOAuthMetadata.options(
  "/.well-known/oauth-protected-resource",
  () => new Response(null, { status: 204, headers: METADATA_CORS }),
);
routesOAuthMetadata.get(
  "/.well-known/oauth-protected-resource",
  (c) => protectedResourceMetadata(c.req.raw),
);

routesOAuthMetadata.options(
  "/.well-known/oauth-protected-resource/mcp",
  () => new Response(null, { status: 204, headers: METADATA_CORS }),
);
routesOAuthMetadata.get(
  "/.well-known/oauth-protected-resource/mcp",
  (c) => protectedResourceMetadata(c.req.raw),
);

// RFC 8414 — authorization server metadata, proxied from Clerk.
//
// A client that predates RFC 9728 does not know to look for the
// protected-resource document; it goes straight to
// <resource-origin>/.well-known/oauth-authorization-server. Serving Clerk's own
// document there keeps those clients working.
//
// The body is returned VERBATIM, so `issuer` says clerk.<domain> while the
// document was fetched from the instance origin. That mismatch is deliberate:
// the endpoints must point at Clerk (they are Clerk's), and rewriting `issuer`
// to this origin would be a lie that breaks the token exchange. Clients strict
// enough to reject the mismatch are exactly the modern ones that use the RFC
// 9728 document above instead.
const AS_METADATA_TTL_MS = 10 * 60 * 1000;
let asMetadataCache: { body: string; fetchedAt: number } | null = null;

async function authorizationServerMetadata(): Promise<Response> {
  const authServer = authorizationServerUrl();
  if (authServer === null) {
    return unavailableResponse();
  }
  if (
    asMetadataCache !== null &&
    Date.now() - asMetadataCache.fetchedAt < AS_METADATA_TTL_MS
  ) {
    return new Response(asMetadataCache.body, {
      status: 200,
      headers: { "content-type": "application/json", ...METADATA_CORS },
    });
  }
  let body: string;
  try {
    const upstream = await fetch(
      `${authServer}/.well-known/oauth-authorization-server`,
    );
    if (!upstream.ok) {
      return unavailableResponse();
    }
    body = await upstream.text();
  } catch (error) {
    console.error(
      "Could not fetch Clerk authorization server metadata:",
      error,
    );
    return unavailableResponse();
  }
  asMetadataCache = { body, fetchedAt: Date.now() };
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json", ...METADATA_CORS },
  });
}

routesOAuthMetadata.options(
  "/.well-known/oauth-authorization-server",
  () => new Response(null, { status: 204, headers: METADATA_CORS }),
);
routesOAuthMetadata.get(
  "/.well-known/oauth-authorization-server",
  () => authorizationServerMetadata(),
);
