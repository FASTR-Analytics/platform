// Identity-parity test for the /pat mount (REVIEW_MCP_HOST_ARCHITECTURE.md §7):
// the same registry route reached via a personal access token and via a Clerk
// session must resolve to the IDENTICAL user context and effect. The
// representative route is GET /user (getCurrentUser) — its response IS the
// resolved GlobalUser.
//
// The PAT leg is fully real: real headlessAuthMiddleware, real allowlist, real
// route registration, real DB. The Clerk leg simulates only clerkMiddleware's
// output contract — c.set("clerkAuth", authFn), the seam getAuth() invokes —
// because verifying Clerk's network handshake belongs to Clerk, not this app.
// Everything downstream (getGlobalUser → buildGlobalUserFromDb → permission
// middleware → handler) is the real code on both legs.
//
// Run on a machine with the dev database (BYPASS_AUTH= overrides the dev
// .env, which sets it truthy — _BYPASS_AUTH is a !! check, so only an empty
// value clears it):
//   BYPASS_AUTH= deno test -A --env-file server/tests/pat_identity_parity_test.ts

import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import type { ServerActionTransport } from "../../lib/server_actions/transport.ts";
import { setServerActionTransport } from "../../lib/server_actions/transport.ts";
import { createAllServerActions } from "../../lib/server_actions/create_server_action.ts";
import { routesUsers } from "../routes/instance/users.ts";
import { headlessAuthMiddleware } from "../middleware/auth.ts";
import { headlessRouteAllowlist } from "../middleware/headless_allowlist.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken,
} from "../db/instance/personal_access_tokens.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";

const TEST_EMAIL = "pat-parity-test@example.com";

// clerkMiddleware's output contract, as of @hono/clerk-auth v3: c.var.clerkAuth
// is the auth FUNCTION getAuth() invokes (v2 stored the auth object itself),
// and the object it returns is tagged with tokenType — which getClerkSessionAuth
// checks, because v3 authenticates with acceptsToken:"any" and would otherwise
// let a machine token through the cookie mount.
function clerkLegMiddleware(sessionClaims: Record<string, unknown>) {
  return async (
    c: { set: (k: never, v: never) => void },
    next: () => Promise<void>,
  ) => {
    c.set(
      "clerkAuth" as never,
      (() => ({
        userId: "user_parity_test",
        tokenType: "session_token",
        sessionClaims,
      })) as never,
    );
    await next();
  };
}

Deno.test("PAT auth resolves to the identical user context as Clerk auth (GET /user)", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set — the parity test must exercise the real auth branches. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${TEST_EMAIL}, FALSE)
    ON CONFLICT DO NOTHING
  `;
  const minted = await createPersonalAccessToken(
    mainDb,
    TEST_EMAIL,
    "parity-test",
  );
  if (!minted.success) throw new Error(minted.err);

  try {
    // PAT leg — the real /pat composition from main.ts.
    const headlessApp = new Hono();
    headlessApp.use("*", headlessAuthMiddleware as never);
    headlessApp.use("*", headlessRouteAllowlist);
    headlessApp.route("/", routesUsers);
    const patRes = await headlessApp.request("/user", {
      headers: { Authorization: `Bearer ${minted.data.token}` },
    });
    assertEquals(patRes.status, 200);
    const patBody = await patRes.json();

    // Clerk leg — the same route registration behind clerkMiddleware's output.
    const clerkApp = new Hono();
    clerkApp.use(
      "*",
      clerkLegMiddleware({
        email: TEST_EMAIL,
        firstName: null,
        lastName: null,
      }) as never,
    );
    clerkApp.route("/", routesUsers);
    const clerkRes = await clerkApp.request("/user");
    assertEquals(clerkRes.status, 200);
    const clerkBody = await clerkRes.json();

    // Identical user context: same email, same permission set, same flags.
    assertEquals(patBody, clerkBody);
    assertEquals(patBody.success, true);
    assertEquals(patBody.data.email, TEST_EMAIL);

    // Clerk leg with REAL name claims. Names are the one intrinsic divergence
    // (claims take precedence over the DB in buildGlobalUserFromDb; a PAT has
    // no claims), so assert field-wise parity on everything EXCEPT the names —
    // this is what catches permission-set drift between the two branches
    // without being calibrated to the null-claims case where both legs
    // trivially agree.
    const clerkNamedApp = new Hono();
    clerkNamedApp.use(
      "*",
      clerkLegMiddleware({
        email: TEST_EMAIL,
        firstName: "Parity",
        lastName: "Probe",
      }) as never,
    );
    clerkNamedApp.route("/", routesUsers);
    const clerkNamedRes = await clerkNamedApp.request("/user");
    assertEquals(clerkNamedRes.status, 200);
    const clerkNamedBody = await clerkNamedRes.json();
    const { firstName: _cf, lastName: _cl, ...clerkNamedRest } =
      clerkNamedBody.data;
    const { firstName: _pf, lastName: _pl, ...patRest } = patBody.data;
    assertEquals(patRest, clerkNamedRest);
    assertEquals(clerkNamedBody.data.firstName, "Parity");

    // Poison net: getCurrentUser fires syncUserName as a side effect. The PAT
    // leg carries no name claims, and GlobalUser coerces them to "" — writing
    // "" would defeat the first_name IS NULL guard forever, killing the real
    // Clerk name sync. The write is fire-and-forget, so give it a beat.
    // ORDER CONSTRAINT: the PAT leg must run BEFORE the named Clerk leg. This
    // assert is the only one that pins the ""-poisoning regression, and it
    // only sees the bug if the PAT whoami had a chance to write "" first —
    // reordering the legs makes it pass vacuously.
    await new Promise((r) => setTimeout(r, 300));
    const rows = await mainDb<{ first_name: string | null }[]>`
      SELECT first_name FROM users WHERE email = ${TEST_EMAIL}
    `;
    assertEquals(rows[0].first_name, "Parity");

    // Explicit-transport leg (PLAN_112 step 2): the same route reached
    // through createAllServerActions over an EXPLICIT transport whose
    // fetchImpl dispatches in-process into headlessApp must be byte-identical to
    // the raw headlessApp request — this is the /mcp endpoint's dispatch path
    // (D4), proven against the real middleware chain.
    const explicitTransport: ServerActionTransport = {
      baseUrl: "",
      refreshSession: async () => {},
      getHeaders: () => ({ Authorization: `Bearer ${minted.data.token}` }),
      credentials: "omit",
      onPersistentAuthFailure: () => {},
      fetchImpl: async (input, init) => await headlessApp.request(input, init),
    };
    // Fresh raw baseline taken NOW: the named-Clerk leg above already synced
    // first_name into the DB, so the original patBody is stale by design.
    const freshPatRes = await headlessApp.request("/user", {
      headers: { Authorization: `Bearer ${minted.data.token}` },
    });
    const freshPatBody = await freshPatRes.json();
    const explicitActions = createAllServerActions(explicitTransport);
    const viaExplicit = await explicitActions.getCurrentUser({});
    assertEquals(viaExplicit, freshPatBody);

    // Defaulted-caller leg: the SAME transport registered globally and
    // reached through a no-arg createAllServerActions() (the SPA's spelling)
    // must behave identically — the explicit param changes nothing for
    // defaulted callers.
    setServerActionTransport(explicitTransport);
    const defaultedActions = createAllServerActions();
    const viaDefaulted = await defaultedActions.getCurrentUser({});
    assertEquals(viaDefaulted, viaExplicit);

    // Deny-by-default: a route outside the allowlist 403s under PAT even with
    // a valid token (PATs can never reach token mint/list/revoke).
    const denied = await headlessApp.request("/personal-access-tokens", {
      headers: { Authorization: `Bearer ${minted.data.token}` },
    });
    assertEquals(denied.status, 403);

    // A bad token never reaches a handler.
    const badToken = await headlessApp.request("/user", {
      headers: { Authorization: "Bearer fastr_pat_deadbeef" },
    });
    assertEquals(badToken.status, 401);

    // No Authorization header at all → 401, not a Clerk fallback.
    const noAuth = await headlessApp.request("/user");
    assertEquals(noAuth.status, 401);
  } finally {
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, minted.data.pat.id);
    await mainDb`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    await closeAllConnections();
  }
});
