// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Clerk providers behind the _113 identity seam (graduated from the
// panterra lab, Phase 3/4). The module owns credential JUDGMENT — token-type
// pins, tri-state reason classification, the load-bearing OAuth user cache;
// the app owns identity CONSTRUCTION — what an identity is, how session
// claims or a fetched user become one, and who holds which role.
//
// Two constructors, one credential class each. A door that accepted several
// classes would have to discriminate them internally and every class added
// would widen every door — so the door IS the discriminator: the session
// provider guards browser-facing routes, the OAuth provider guards the
// headless/MCP door, and each pins exactly one `acceptsToken` value. (The
// pin is a security property: @clerk/backend v3 authenticates ANY token
// type by default, so an unpinned browser door would accept machine
// tokens.)
//
// The _113 tri-state contract, and why the mapping is allow-listed: Clerk
// NEVER throws on verification failure — unknown token, wrong secret key,
// and JWKS/network outage all fold into one non-throwing signed-out state
// with a `reason` string. Mapping all of those to null would answer 401
// during a Clerk outage, telling clients to discard good credentials. So
// only reasons that unambiguously mean "this credential is bad" resolve to
// null; anything else throws and becomes a 503 the client retries. Reasons
// transcribed from the installed @clerk/backend 3.16.11 source, not docs.

import { type ClerkClient, createClerkClient } from "./deps.ts";
import type { IdentityProvider } from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////
// REASON CLASSIFICATION (pure; pinned by tests/clerk_identity_test.ts)
////////////////////////////////////////////////////////////////////////////////

const SESSION_BAD_CREDENTIAL_REASONS: readonly string[] = [
  // Malformed or unverifiable JWT.
  "token-invalid",
  "token-invalid-signature",
  "token-invalid-algorithm",
  // Minted for a different origin (azp claim vs authorizedParties).
  "token-invalid-authorized-parties",
  // A machine/OAuth token presented where only session tokens are accepted.
  "token-type-mismatch",
];

// Genuine expiry is NORMAL on the session leg (clerk-js refreshes the JWT
// continuously; an expired token means the client's next getToken()
// succeeds), and the SDK keeps it distinct from JWKS outage — but only as a
// prefix: non-browser requests get "session-token-expired-refresh-<cause>".
const SESSION_EXPIRED_REASON_PREFIX = "session-token-expired-refresh-";

export function isBadSessionCredentialReason(reason: string): boolean {
  return SESSION_BAD_CREDENTIAL_REASONS.includes(reason) ||
    reason.startsWith(SESSION_EXPIRED_REASON_PREFIX);
}

// Live facts (dev instance, 2026-08-25) that settled the two parked
// hazards: a DCR-registered client receives JWT access tokens by default
// (~24h expiry; a refresh token is issued when offline_access is granted,
// and the refresh grant rotates it). Clerk REFUSES to revoke a JWT access
// token (400 unsupported_token_type) — revoking the refresh token works,
// so a revoked grant stops refreshing but an outstanding JWT rides out its
// lifetime; instances needing a tight revocation window configure OPAQUE
// tokens in the Clerk dashboard, where verification is a Backend API call
// per cache miss. If an instance does opt into opaque tokens, note the SDK
// reads `revoked`/`expired` off the verified record without checking them
// — safe only while Clerk's verify endpoint answers 4xx for revoked
// tokens; re-verify that if opaque revocation ever appears not to land.
const OAUTH_BAD_CREDENTIAL_REASONS: readonly string[] = [
  // Clerk answered 404 — unknown, expired, or revoked token.
  "token-invalid",
  // A Bearer token that is not an OAuth access token at all. Costs no
  // network call: Clerk short-circuits on the token shape.
  "token-type-mismatch",
];

export function isBadOAuthCredentialReason(reason: string): boolean {
  return OAUTH_BAD_CREDENTIAL_REASONS.includes(reason);
}

// The JWT-expiry pre-check. JWT access tokens verify LOCALLY against JWKS,
// and the SDK folds genuine expiry into "token-verification-failed"
// together with bad signature AND jwks-fetch outage — which correctly
// throws above (a 503 the client retries). But an EXPIRED token answered
// 503 wedges every session at expiry: the client retries instead of
// refreshing. So genuine expiry is detected here, locally, before Clerk is
// asked: only a well-formed JWT whose exp has passed maps to null (401 →
// the client refreshes). Anything unparseable is left for Clerk to judge —
// widening the reason allow-list instead would misreport a JWKS outage as
// a bad credential.
export function isExpiredJwt(token: string, nowMs: number): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
      ),
    );
    return typeof payload.exp === "number" && payload.exp * 1000 < nowMs;
  } catch {
    return false;
  }
}

////////////////////////////////////////////////////////////////////////////////
// SHARED CLIENT CONSTRUCTION
////////////////////////////////////////////////////////////////////////////////

type ClerkKeys = { secretKey: string; publishableKey: string };

function buildClerkClient(keys: ClerkKeys): ClerkClient {
  if (!keys.secretKey || !keys.publishableKey) {
    // Constructors run at app boot: refusing to start beats resolving every
    // credential to a 503 at runtime.
    throw new Error(
      "Clerk provider requires both secretKey and publishableKey",
    );
  }
  return createClerkClient({
    secretKey: keys.secretKey,
    publishableKey: keys.publishableKey,
    // No outbound analytics request inside an auth path.
    telemetry: { disabled: true },
  });
}

const BEARER_PREFIX = "Bearer ";

////////////////////////////////////////////////////////////////////////////////
// SESSION PROVIDER (browser leg)
////////////////////////////////////////////////////////////////////////////////

export type ClerkSessionProviderConfig<TIdentity> = {
  secretKey: string;
  publishableKey: string;
  // The browsing origin(s) the session JWT's azp claim must match.
  authorizedParties: string[];
  // App-owned identity construction from the verified session claims (the
  // claim shape is Dashboard-configured app data). THROW for claims that
  // are missing what the dashboard should project — that is a server-side
  // misconfiguration (503), never a bad credential.
  identity: (sessionClaims: unknown) => TIdentity;
  identityKey: (identity: TIdentity) => string;
};

export function createClerkSessionProvider<TIdentity>(
  config: ClerkSessionProviderConfig<TIdentity>,
): IdentityProvider<TIdentity> {
  const client = buildClerkClient(config);
  return {
    resolve: async (request) => {
      // No Bearer credential at all → 401, before any Clerk involvement.
      const header = request.headers.get("Authorization");
      if (!header?.startsWith(BEARER_PREFIX)) {
        return null;
      }
      const state = await client.authenticateRequest(request, {
        acceptsToken: "session_token",
        authorizedParties: config.authorizedParties,
      });
      const auth = state.toAuth();
      if (!auth?.isAuthenticated) {
        // A verified session in Clerk's "pending" state (sign-in tasks not
        // finished) reports status signed-in but an unauthenticated auth
        // object: the user must complete sign-in → 401, not an outage.
        if (state.status === "signed-in") {
          return null;
        }
        const reason = state.reason ?? "";
        if (isBadSessionCredentialReason(reason)) {
          return null;
        }
        throw new Error(
          `Clerk could not verify the session token (reason: ${
            reason || "unknown"
          })`,
        );
      }
      if (auth.tokenType !== "session_token") {
        return null;
      }
      return config.identity(auth.sessionClaims);
    },
    identityKey: config.identityKey,
  };
}

////////////////////////////////////////////////////////////////////////////////
// OAUTH PROVIDER (headless leg)
////////////////////////////////////////////////////////////////////////////////

export type ClerkOAuthUser = {
  // The PRIMARY address, lower-cased — the same address session claims
  // carry, which is what makes an OAuth caller and a browser login resolve
  // to the identical identityKey.
  email: string;
  // A user who never set a name is a legitimate account state, not an
  // error; the app decides the fallback.
  name: string | null;
};

export type ClerkOAuthProviderConfig<TIdentity> = {
  secretKey: string;
  publishableKey: string;
  // App-owned identity construction (role lookup lives here). Runs on
  // EVERY resolve — only the Clerk fetch is cached — so app-side changes
  // (role map edits) land immediately.
  identity: (user: ClerkOAuthUser) => TIdentity;
  identityKey: (identity: TIdentity) => string;
  // The user cache bounds BOTH the Clerk Backend API cost (verifying an
  // opaque token and fetching the user are network calls, per dispatch)
  // and the revocation window: a grant revoked in Clerk keeps working for
  // up to one TTL. Positive entries only — failures are never cached, so a
  // bad token cannot hold a slot and a revoked one is re-asked about.
  cacheTtlMs?: number;
  cacheCap?: number;
  // Injectable clock for tests.
  now?: () => number;
};

const DEFAULT_OAUTH_CACHE_TTL_MS = 30_000;
const DEFAULT_OAUTH_CACHE_CAP = 200;

export function createClerkOAuthProvider<TIdentity>(
  config: ClerkOAuthProviderConfig<TIdentity>,
): IdentityProvider<TIdentity> {
  return createClerkOAuthProviderWith(buildClerkClient(config), config);
}

// Internal seam: tests drive the resolve contract with a fake client. Not
// exported from mod.ts.
export function createClerkOAuthProviderWith<TIdentity>(
  client: ClerkClient,
  config: ClerkOAuthProviderConfig<TIdentity>,
): IdentityProvider<TIdentity> {
  const ttlMs = config.cacheTtlMs ?? DEFAULT_OAUTH_CACHE_TTL_MS;
  const cap = config.cacheCap ?? DEFAULT_OAUTH_CACHE_CAP;
  const now = config.now ?? Date.now;
  const cache = new Map<string, { user: ClerkOAuthUser; at: number }>();

  const cacheGet = (token: string): ClerkOAuthUser | null => {
    const entry = cache.get(token);
    if (entry === undefined) {
      return null;
    }
    if (now() - entry.at > ttlMs) {
      cache.delete(token);
      return null;
    }
    // LRU refresh: re-insert so Map iteration order tracks recency.
    cache.delete(token);
    cache.set(token, entry);
    return entry.user;
  };

  const cacheSet = (token: string, user: ClerkOAuthUser): void => {
    cache.set(token, { user, at: now() });
    while (cache.size > cap) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  return {
    resolve: async (request) => {
      const header = request.headers.get("Authorization");
      if (!header?.startsWith(BEARER_PREFIX)) {
        return null;
      }
      const token = header.slice(BEARER_PREFIX.length);
      const cached = cacheGet(token);
      if (cached !== null) {
        return config.identity(cached);
      }
      if (isExpiredJwt(token, now())) {
        return null;
      }
      const state = await client.authenticateRequest(request, {
        acceptsToken: "oauth_token",
      });
      const auth = state.toAuth();
      if (!auth?.isAuthenticated) {
        const reason = state.reason ?? "";
        if (isBadOAuthCredentialReason(reason)) {
          return null;
        }
        throw new Error(
          `Clerk could not verify the OAuth access token (reason: ${
            reason || "unknown"
          })`,
        );
      }
      if (auth.tokenType !== "oauth_token") {
        return null;
      }
      // The OAuth auth object has userId/clientId and NO email: identity
      // costs a Backend API call. A failure there throws (→ 503).
      const user = await client.users.getUser(auth.userId);
      const primary = user.emailAddresses.find(
        (e) => e.id === user.primaryEmailAddressId,
      );
      if (primary === undefined) {
        // A Clerk user with no primary email cannot be mapped to an app
        // identity: a bad credential for our purposes, not an outage.
        return null;
      }
      const resolved: ClerkOAuthUser = {
        email: primary.emailAddress.toLowerCase(),
        name: user.fullName,
      };
      cacheSet(token, resolved);
      return config.identity(resolved);
    },
    identityKey: config.identityKey,
  };
}

////////////////////////////////////////////////////////////////////////////////
// FRONTEND API DERIVATION
////////////////////////////////////////////////////////////////////////////////

// The Clerk Frontend API host is encoded in the publishable key:
// pk_(test|live)_<base64(host + "$")>. Deriving the instance's authorization
// server URL from the key in use means no second env var that could drift
// out of sync with it. Returns null for anything that does not decode to a
// plausible hostname.
export function clerkFrontendApiUrl(publishableKey: string): string | null {
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
  if (host === "" || !/^[A-Za-z0-9.-]+$/.test(host)) {
    return null;
  }
  return `https://${host}`;
}
