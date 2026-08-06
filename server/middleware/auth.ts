import { clerkMiddleware, getAuth } from "@hono/clerk-auth";
import type { Context } from "hono";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { resolveHeadlessCredentialEmail } from "../headless_auth.ts";

type HeadlessVariables = { headlessAuthEmail?: string };

// Set only when the request authenticated with a headless credential (PAT or
// OAuth). getGlobalUser branches on this before consulting Clerk.
export function getHeadlessAuthEmail(c: Context): string | undefined {
  return (c.var as HeadlessVariables).headlessAuthEmail;
}

// @hono/clerk-auth is typed against a different hono version than this app's;
// the loose signature keeps the cross-version mismatch out of the call site.
const clerkAuth = clerkMiddleware() as unknown as (
  c: Context,
  next: () => Promise<void>,
) => Promise<Response | void>;

// The cookie mount's ONLY credential is a Clerk session cookie. Two things
// changed under @hono/clerk-auth v3 that this accessor exists to absorb:
//
// 1. clerkMiddleware now authenticates with `acceptsToken: "any"` (v2 was
//    session-tokens-only). So a machine token — API key, M2M, and after this
//    plan an OAuth access token — presented as a Bearer header to an ordinary
//    /api route now produces an AUTHENTICATED machine auth object carrying a
//    userId but NO sessionClaims. Headless credentials are judged at the two
//    headless judgment points and nowhere else, so the tokenType guard below
//    restores v2's behaviour exactly: anything that is not a session token is
//    NOT_AUTHENTICATED here.
// 2. c.var.clerkAuth went from the auth OBJECT to an auth FUNCTION, so
//    getAuth(c) now invokes it. Call sites must never read c.var.clerkAuth
//    directly (server/tests/pat_identity_parity_test.ts pins this contract).
export type ClerkSessionAuth = {
  userId: string | null;
  sessionClaims: Record<string, unknown>;
};

const CLERK_SESSION_TOKEN_TYPE = "session_token";

export function getClerkSessionAuth(c: Context): ClerkSessionAuth | null {
  // @ts-ignore: Clerk middleware types not fully compatible with Hono
  const auth = getAuth(c) as
    | (ClerkSessionAuth & { tokenType?: string })
    | null
    | undefined;
  if (!auth || auth.tokenType !== CLERK_SESSION_TOKEN_TYPE) {
    return null;
  }
  return auth;
}

// Cookie mount: Clerk ONLY. Headless clients authenticate through the headless
// app (headlessAuthMiddleware below); a headless credential presented here
// falls through to Clerk and fails like any other bad credential.
export const authMiddleware = _BYPASS_AUTH
  ? async (c: any, next: any) => await next()
  : clerkAuth;

// The headless mount: headless credentials ONLY — no Clerk fallback, no
// cookies. The credential resolves to the real user identity, so all
// downstream permission checks are the user's own (getGlobalUser branches on
// headlessAuthEmail). This is the SECOND of the two judgment points; the
// resolver it delegates to is the first's too.
async function headlessOnlyMiddleware(c: Context, next: () => Promise<void>) {
  const authz = c.req.header("Authorization");
  let email: string | null;
  try {
    email = await resolveHeadlessCredentialEmail(authz);
  } catch (error) {
    // The credential was NOT judged (DB or Clerk unreachable) — 503, so the
    // client retries instead of discarding a token that may be perfectly good.
    console.error("Error resolving headless credential:", error);
    c.status(503);
    return c.json({
      success: false,
      err: "Service temporarily unavailable",
    });
  }
  if (email === null) {
    c.status(401);
    return c.json({
      success: false,
      err: "Valid headless credential required",
      authError: true,
    });
  }
  (c as Context<{ Variables: { headlessAuthEmail: string } }>).set(
    "headlessAuthEmail",
    email,
  );
  await next();
}

export const headlessAuthMiddleware = _BYPASS_AUTH
  ? async (c: any, next: any) => await next()
  : headlessOnlyMiddleware;
