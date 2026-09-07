// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// OAuth discovery for a Clerk-guarded MCP resource (graduated from the
// panterra lab). These are the documents an OAuth-capable MCP client fetches
// to learn that the resource is protected and WHICH authorization server
// guards it — public by design: a client reads them *before* it has any
// credential. The app is only the resource server; Clerk is the
// authorization server (it owns /authorize, /token, and — with dynamic
// client registration enabled — client registration). Nothing here issues
// or validates a token; credentials are judged by this module's providers.
//
// The result is consumed WHOLE by the MCP door (_222): the 401 challenge's
// resource_metadata pointer derives from the same origin derivation as the
// document it points at, by construction — RFC 9728 ties the pointer to the
// resource identifier the client used, so if the two ever disagreed the
// discovery would be broken in a way neither side could detect alone.

import { clerkFrontendApiUrl } from "./clerk_identity.ts";

// Fetched cross-origin from the client's own web app and carrying no
// credentials, so a wildcard origin is correct and safe.
const METADATA_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const AS_METADATA_TTL_MS = 10 * 60 * 1000;

const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const AUTHORIZATION_SERVER_PATH = "/.well-known/oauth-authorization-server";

export type OAuthDiscoveryConfig = {
  // The SAME key the providers verify with: the authorization server URL
  // derives from it (clerkFrontendApiUrl), so there is no second value to
  // drift. An empty/undecodable key (e.g. dev mode) answers every document
  // 503 — the endpoint exists, the instance just is not configured to
  // advertise an AS; a 404 would tell a client this server does not do
  // OAuth at all (a stickier wrong conclusion).
  publishableKey: string;
  // Where the protected resource is mounted. Default "/mcp".
  resourcePathname?: string;
  // Identity-only by default: an app that authorizes against its own role
  // map has no app-specific scope to grant.
  scopes?: string[];
  // Overrides the request-derived origin (x-forwarded-proto + Host) for
  // deployments where the Host header is not the public host.
  publicOrigin?: string | ((req: Request) => string);
  // Injectable for tests (the AS proxy fetch and its cache clock).
  fetchFn?: typeof fetch;
  now?: () => number;
};

export type OAuthDiscoveryHandler = {
  handler: (req: Request) => Promise<Response>;
  // The absolute URL of the resource-suffixed protected-resource document,
  // derived from the SAME origin derivation the handler serves it under —
  // what the MCP door's 401 challenge points at.
  resourceMetadataUrl: (req: Request) => string;
};

export function createOAuthDiscoveryHandler(
  config: OAuthDiscoveryConfig,
): OAuthDiscoveryHandler {
  const resourcePathname = config.resourcePathname ?? "/mcp";
  const scopes = config.scopes ?? ["profile", "email"];
  const fetchFn = config.fetchFn ?? fetch;
  const now = config.now ?? Date.now;
  const authServer = clerkFrontendApiUrl(config.publishableKey);

  // The public origin derives from the REQUEST unless overridden: the
  // scheme from X-Forwarded-Proto because TLS terminates at a proxy in
  // deployment (locally plain http is the truth). Both header and Host are
  // caller-influenced, which is acceptable precisely because the derived
  // value only ever appears in the response to that same caller — never
  // stored, never shared across callers.
  const publicOrigin = (req: Request): string => {
    if (typeof config.publicOrigin === "string") {
      return config.publicOrigin;
    }
    if (typeof config.publicOrigin === "function") {
      return config.publicOrigin(req);
    }
    const url = new URL(req.url);
    const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]
      ?.trim();
    if (forwarded === "https" || forwarded === "http") {
      url.protocol = `${forwarded}:`;
    }
    return url.origin;
  };

  const resourceMetadataUrl = (req: Request): string =>
    `${publicOrigin(req)}${PROTECTED_RESOURCE_PATH}${resourcePathname}`;

  // RFC 9728 §3 — protected resource metadata. Two paths, one document: the
  // spec-correct location for the resource <origin><resourcePathname> is
  // the suffixed path (what the 401 challenge points at); the bare path is
  // served too because clients differ on which they probe and answering
  // both costs nothing.
  const protectedResourceMetadata = (req: Request): Response => {
    if (authServer === null) {
      return unavailableResponse();
    }
    return jsonResponse(200, {
      resource: `${publicOrigin(req)}${resourcePathname}`,
      authorization_servers: [authServer],
      bearer_methods_supported: ["header"],
      scopes_supported: scopes,
    });
  };

  // RFC 8414 — authorization server metadata, proxied from Clerk for
  // clients that predate RFC 9728 and probe <resource-origin> directly.
  // Returned VERBATIM: `issuer` names Clerk's origin while the document is
  // fetched from this one, and rewriting it would break the token exchange;
  // clients strict enough to reject the mismatch are exactly the modern
  // ones that use the RFC 9728 document instead.
  let asMetadataCache: { body: string; fetchedAt: number } | null = null;
  const authorizationServerMetadata = async (): Promise<Response> => {
    if (authServer === null) {
      return unavailableResponse();
    }
    if (
      asMetadataCache !== null &&
      now() - asMetadataCache.fetchedAt < AS_METADATA_TTL_MS
    ) {
      return verbatimResponse(asMetadataCache.body);
    }
    let body: string;
    try {
      const upstream = await fetchFn(
        `${authServer}${AUTHORIZATION_SERVER_PATH}`,
      );
      if (!upstream.ok) {
        return unavailableResponse();
      }
      body = await upstream.text();
    } catch (cause) {
      console.error("Could not fetch Clerk AS metadata:", cause);
      return unavailableResponse();
    }
    asMetadataCache = { body, fetchedAt: now() };
    return verbatimResponse(body);
  };

  const handler = (req: Request): Promise<Response> => {
    const pathname = new URL(req.url).pathname;
    const known = pathname === PROTECTED_RESOURCE_PATH ||
      pathname === `${PROTECTED_RESOURCE_PATH}${resourcePathname}` ||
      pathname === AUTHORIZATION_SERVER_PATH;
    if (!known) {
      return Promise.resolve(
        jsonResponse(404, { error: "not found" }),
      );
    }
    if (req.method === "OPTIONS") {
      return Promise.resolve(
        new Response(null, { status: 204, headers: METADATA_CORS }),
      );
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return Promise.resolve(
        jsonResponse(405, { error: "method not allowed" }),
      );
    }
    if (pathname === AUTHORIZATION_SERVER_PATH) {
      return authorizationServerMetadata();
    }
    return Promise.resolve(protectedResourceMetadata(req));
  };

  return { handler, resourceMetadataUrl };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", ...METADATA_CORS },
  });
}

function unavailableResponse(): Response {
  return jsonResponse(503, { error: "oauth metadata unavailable" });
}

function verbatimResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json", ...METADATA_CORS },
  });
}
