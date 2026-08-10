import { createClerkClient } from "@clerk/backend";
import { getPgConnectionFromCacheOrNew } from "./db/mod.ts";
import {
  PAT_PREFIX,
  resolvePersonalAccessTokenEmail,
} from "./db/instance/personal_access_tokens.ts";
import {
  _CLERK_PUBLISHABLE_KEY,
  _CLERK_SECRET_KEY,
} from "./exposed_env_vars.ts";

// The headless credential seam (PLAN_MCP_OAUTH). Headless clients — Claude
// Code with a PAT, claude.ai with a Clerk OAuth grant — carry no cookies, so
// their identity is resolved from the Authorization header alone.
//
// There are exactly TWO judgment points, and both call this one function:
//   1. the /mcp door           (server/mcp/mcp_endpoint.ts authenticate hook)
//   2. the per-dispatch chain  (server/middleware/auth.ts, which the in-process
//      headlessApp runs for every server action an MCP tool call dispatches)
//
// Verifying only at the door is not enough: an OAuth connector would connect
// and list tools, then fail on every real tool dispatch. Because the credential
// enters through this single seam, every property the dispatch path provides —
// deny-by-default allowlist, identity parity with the cookie mount, revocation
// reaching staged commits — extends to any credential type added here.
//
// Contract: null means "not a valid headless credential" (callers answer 401);
// a THROW means the backend could not judge the credential (callers answer
// 503, so clients retry rather than discard a good token).

export const BEARER_PREFIX = "Bearer ";

export async function resolveHeadlessCredentialEmail(
  authorizationHeader: string | null | undefined,
): Promise<string | null> {
  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = authorizationHeader.slice(BEARER_PREFIX.length);

  // PAT branch FIRST and unchanged — this is the regression surface for Claude
  // Code. One round trip both verifies the token and stamps last_used_at, so a
  // revoked PAT stops working on the very next dispatch.
  if (token.startsWith(PAT_PREFIX)) {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
    return await resolvePersonalAccessTokenEmail(mainDb, token);
  }

  return await resolveOAuthAccessTokenEmail(token);
}

///////////////////////////////////////////////////////////////////////////////
// OAuth branch: Clerk-issued access tokens (claude.ai custom connectors)
///////////////////////////////////////////////////////////////////////////////

// LOAD-BEARING, not an optimization. Clerk's OAuth auth object carries userId
// but NO email, so resolving one costs a Backend API call (users.getUser), and
// an opaque token costs a second one to verify. Every MCP tool call dispatches
// several server actions, each re-presenting the credential — without this
// cache a single tool call would burn a handful of rate-limited Clerk calls.
//
// The TTL is therefore doing two jobs at once: bounding cost, and bounding the
// revocation window. It is aligned with the /mcp context cache's CONTEXT_TTL_MS
// so both age out together. This is the accepted revocation asymmetry: a PAT is
// re-checked against the DB on every dispatch (revocation is immediate), an
// OAuth grant revoked in Clerk keeps working for up to one TTL.
//
// POSITIVE ENTRIES ONLY. Failures are never cached: a bad token must not be
// able to occupy a cache slot, and re-asking Clerk about a revoked token is
// exactly the behaviour we want.
//
// ACCEPTED, not overlooked: this means a flood of DISTINCT well-shaped tokens
// (`oat_…` or JWT-shaped) costs one Clerk Backend API call each and can burn
// the instance's rate limit, degrading OAuth auth to 503s. Unshaped garbage is
// free — Clerk rejects it on the prefix with no network call — so this needs a
// deliberate attacker. Negative caching would NOT fix it: the cache is keyed by
// token, so an attacker who varies the token misses every time. The real
// mitigation, if this ever matters, is request-rate limiting at the edge or a
// circuit breaker around the verifier, not a bigger cache.
const OAUTH_EMAIL_TTL_MS = 30_000;
const OAUTH_EMAIL_CACHE_CAP = 200;

type OAuthEmailEntry = { email: string; resolvedAt: number };

const oauthEmails = new Map<string, OAuthEmailEntry>();

function oauthEmailGet(token: string): string | null {
  const entry = oauthEmails.get(token);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.resolvedAt > OAUTH_EMAIL_TTL_MS) {
    oauthEmails.delete(token);
    return null;
  }
  // LRU refresh: re-insert so Map iteration order tracks recency.
  oauthEmails.delete(token);
  oauthEmails.set(token, entry);
  return entry.email;
}

function oauthEmailSet(token: string, email: string): void {
  oauthEmails.set(token, { email, resolvedAt: Date.now() });
  while (oauthEmails.size > OAUTH_EMAIL_CACHE_CAP) {
    const oldest = oauthEmails.keys().next().value;
    if (oldest === undefined) break;
    oauthEmails.delete(oldest);
  }
}

// Clerk folds EVERY verification failure into a non-throwing signed-out state —
// including "your secret key is wrong" and "the network is down". Mapping all
// of those to null would answer 401 during a Clerk outage, and a 401 tells a
// client its token is bad, so it discards a perfectly good grant and forces the
// user back through consent. So the mapping is allow-listed in the OTHER
// direction: only reasons that unambiguously mean "this credential is bad"
// resolve to null; anything else throws and becomes a 503 the client retries.
const BAD_CREDENTIAL_REASONS: readonly string[] = [
  // Clerk answered 404 — unknown, expired, or revoked token.
  "token-invalid",
  // A Bearer token that is not an OAuth access token at all. Note this costs
  // NO network call: Clerk short-circuits on the token prefix, so unshaped
  // garbage is rejected locally.
  "token-type-mismatch",
];

// TWO HAZARDS PARKED HERE DELIBERATELY, both resolved by the same unanswered
// question: does Clerk issue OPAQUE (`oat_…`) or JWT access tokens to a
// dynamically-registered client? Confirm during live verification.
//
// 1. If JWT: `@clerk/backend` verifies locally against JWKS and collapses
//    expiry, bad signature AND jwks-fetch-failure into the single reason
//    `token-verification-failed`, which is NOT in the list above and therefore
//    throws → 503. An EXPIRED token would then make a client retry instead of
//    refreshing, so every connector session wedges at token expiry. Do not fix
//    by adding that reason to the list — that would misreport a JWKS outage as
//    a bad credential. The correct fix is a local `exp` pre-check for
//    JWT-shaped tokens, mapping only genuine expiry to null.
// 2. If OPAQUE: the SDK reads `revoked`/`expired` off the verified token record
//    but never CHECKS them (they are assigned to the resource object and
//    nothing compares them). That is only safe if Clerk's verify endpoint
//    answers 4xx for a revoked/expired token rather than 200 with the flags
//    set. A live 404 was observed for a NONEXISTENT token, which does not
//    settle the revoked case. If revocation mid-session does not take effect,
//    this is why, and the fix is to check those flags explicitly.

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerkClient(): ReturnType<typeof createClerkClient> {
  if (clerkClient === null) {
    if (!_CLERK_SECRET_KEY || !_CLERK_PUBLISHABLE_KEY) {
      // Throw, never return null: a missing key means we CANNOT judge the
      // credential, which is a 503, not "your token is bad".
      throw new Error(
        "Clerk keys are not configured — cannot verify OAuth access tokens",
      );
    }
    clerkClient = createClerkClient({
      secretKey: _CLERK_SECRET_KEY,
      publishableKey: _CLERK_PUBLISHABLE_KEY,
      // No telemetry from inside an auth path: this runs on every dispatch of
      // every tool call, and an outbound analytics request is not something an
      // authentication decision should be waiting behind.
      telemetry: { disabled: true },
    });
  }
  return clerkClient;
}

async function resolveOAuthAccessTokenEmail(
  token: string,
): Promise<string | null> {
  const cached = oauthEmailGet(token);
  if (cached !== null) {
    return cached;
  }

  const client = getClerkClient();
  // authenticateRequest reads ONLY the Authorization header on the machine-token
  // path, so a synthesized Request is a complete input. The URL is never used.
  const probe = new Request("https://headless.invalid/", {
    headers: { Authorization: `${BEARER_PREFIX}${token}` },
  });
  const requestState = await client.authenticateRequest(probe, {
    acceptsToken: "oauth_token",
  });

  const auth = requestState.toAuth();
  if (!auth?.isAuthenticated) {
    const reason = requestState.reason ?? "";
    if (BAD_CREDENTIAL_REASONS.includes(reason)) {
      return null;
    }
    throw new Error(
      `Could not verify OAuth access token (reason: ${reason || "unknown"})`,
    );
  }

  // The OAuth auth object has userId/clientId/scopes and NO email, so the
  // identity still has to be fetched. A failure here throws (→ 503).
  const userId = (auth as { userId?: string | null }).userId;
  if (!userId) {
    throw new Error("Verified OAuth access token carried no userId");
  }
  const user = await client.users.getUser(userId);

  // The PRIMARY email specifically — it is the same address Clerk puts in the
  // session claim the cookie mount reads, which is what makes an OAuth caller
  // and a browser login resolve to the identical FASTR user. (Like the cookie
  // mount, this trusts Clerk's own primary-address handling; we do not re-check
  // verification status, because doing so here and not there would let the same
  // person authenticate one way and not the other.)
  const primary = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );
  if (!primary) {
    // A Clerk user with no primary email cannot be mapped to a FASTR user.
    // That is a bad credential for our purposes, not a backend outage.
    return null;
  }

  oauthEmailSet(token, primary.emailAddress);
  return primary.emailAddress;
}
