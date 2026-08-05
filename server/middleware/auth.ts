import { clerkMiddleware } from "@hono/clerk-auth";
import type { Context } from "hono";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  PAT_PREFIX,
  resolvePersonalAccessTokenEmail,
} from "../db/instance/personal_access_tokens.ts";

type PatVariables = { patAuthEmail?: string };

// Set only when the request authenticated with a personal access token.
// getGlobalUser branches on this before consulting Clerk.
export function getPatAuthEmail(c: Context): string | undefined {
  return (c.var as PatVariables).patAuthEmail;
}

// @hono/clerk-auth is typed against a different hono version than this app's;
// the loose signature keeps the cross-version mismatch out of the call site.
const clerkAuth = clerkMiddleware() as unknown as (
  c: Context,
  next: () => Promise<void>,
) => Promise<Response | void>;

// Headless clients (MCP server, CLI) authenticate with a server-minted
// personal access token in the Authorization header; everything else goes
// through Clerk unchanged. The PAT resolves to the real user identity, so all
// downstream permission checks are the user's own.
async function patOrClerkMiddleware(c: Context, next: () => Promise<void>) {
  const authz = c.req.header("Authorization");
  if (authz?.startsWith(`Bearer ${PAT_PREFIX}`)) {
    const token = authz.slice("Bearer ".length);
    let email: string | null;
    try {
      const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
      email = await resolvePersonalAccessTokenEmail(mainDb, token);
    } catch (error) {
      console.error("Database error resolving personal access token:", error);
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
        err: "Invalid personal access token",
        authError: true,
      });
    }
    (c as Context<{ Variables: { patAuthEmail: string } }>).set(
      "patAuthEmail",
      email,
    );
    await next();
    return;
  }
  return clerkAuth(c, next);
}

export const authMiddleware = _BYPASS_AUTH
  ? async (c: any, next: any) => await next()
  : patOrClerkMiddleware;
