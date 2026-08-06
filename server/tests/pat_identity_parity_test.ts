// Identity-parity test for the /pat mount (REVIEW_MCP_HOST_ARCHITECTURE.md §7):
// the same registry route reached via a personal access token and via a Clerk
// session must resolve to the IDENTICAL user context and effect. The
// representative route is GET /user (getCurrentUser) — its response IS the
// resolved GlobalUser.
//
// The PAT leg is fully real: real patAuthMiddleware, real allowlist, real
// route registration, real DB. The Clerk leg simulates only clerkMiddleware's
// output contract — c.set("clerkAuth", auth), the seam getAuth() reads —
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
import { routesUsers } from "../routes/instance/users.ts";
import { patAuthMiddleware } from "../middleware/auth.ts";
import { patRouteAllowlist } from "../middleware/pat_allowlist.ts";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken,
} from "../db/instance/personal_access_tokens.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";

const TEST_EMAIL = "pat-parity-test@example.com";

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
    const patApp = new Hono();
    patApp.use("*", patAuthMiddleware as never);
    patApp.use("*", patRouteAllowlist);
    patApp.route("/", routesUsers);
    const patRes = await patApp.request("/user", {
      headers: { Authorization: `Bearer ${minted.data.token}` },
    });
    assertEquals(patRes.status, 200);
    const patBody = await patRes.json();

    // Clerk leg — the same route registration behind clerkMiddleware's output.
    const clerkApp = new Hono();
    clerkApp.use("*", async (c, next) => {
      c.set(
        "clerkAuth" as never,
        {
          userId: "user_parity_test",
          sessionClaims: { email: TEST_EMAIL, firstName: null, lastName: null },
        } as never,
      );
      await next();
    });
    clerkApp.route("/", routesUsers);
    const clerkRes = await clerkApp.request("/user");
    assertEquals(clerkRes.status, 200);
    const clerkBody = await clerkRes.json();

    // Identical user context: same email, same permission set, same flags.
    assertEquals(patBody, clerkBody);
    assertEquals(patBody.success, true);
    assertEquals(patBody.data.email, TEST_EMAIL);

    // Deny-by-default: a route outside the allowlist 403s under PAT even with
    // a valid token (PATs can never reach token mint/list/revoke).
    const denied = await patApp.request("/user/personal-access-tokens", {
      headers: { Authorization: `Bearer ${minted.data.token}` },
    });
    assertEquals(denied.status, 403);

    // A bad token never reaches a handler.
    const badToken = await patApp.request("/user", {
      headers: { Authorization: "Bearer fastr_pat_deadbeef" },
    });
    assertEquals(badToken.status, 401);

    // No Authorization header at all → 401, not a Clerk fallback.
    const noAuth = await patApp.request("/user");
    assertEquals(noAuth.status, 401);
  } finally {
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, minted.data.pat.id);
    await mainDb`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    await closeAllConnections();
  }
});
