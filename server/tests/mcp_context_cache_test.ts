// Regression pin for the /mcp context cache (PLAN_112 step 4, re-cut to the
// pinned package 2026-08-19).
//
// WHY THIS EXISTS: the cache is keyed by (token, runId). The token half is
// what makes revocation invalidation exact — every context captures server
// actions bound to the building request's credential, so two PATs for the
// SAME user must never share a context (a revoked token's context must not
// keep serving another token's calls). The pin is object IDENTITY: a cached
// context is returned by reference, so a rebuild is observable without
// reaching into cache internals.
//
// Run on a machine with the dev database, auth ON (the dev .env sets
// BYPASS_AUTH truthy; _BYPASS_AUTH is a !! check, so only an empty value
// clears it — with it set, resolveGlobalUser short-circuits to the dev
// identity and the token half of the key is never exercised):
//   BYPASS_AUTH= deno test -A --env-file server/tests/mcp_context_cache_test.ts

import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  createPersonalAccessToken,
  revokePersonalAccessToken,
} from "../db/instance/personal_access_tokens.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { resolvePackageContext } from "../mcp/context_cache.ts";

const TEST_EMAIL = "mcp-context-cache-test@example.com";

Deno.test("/mcp context cache: keyed by (token, runId) — same user, two PATs, two contexts", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set — resolveGlobalUser would short-circuit to the dev identity and the token half of the cache key would go unexercised. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

  // A global admin: the can_view_data door check admits admins outright.
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${TEST_EMAIL}, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
  `;

  // Any READY package — the context build reads its real manifest.
  const runs = await mainDb<{ id: string }[]>`
    SELECT id FROM runs WHERE status = 'ready' ORDER BY created_at DESC LIMIT 1
  `;
  const runId = runs.at(0)?.id;
  if (!runId) {
    throw new Error(
      "No ready results package in the dev database — this test needs one to build a context against.",
    );
  }

  const mintedA = await createPersonalAccessToken(
    mainDb,
    TEST_EMAIL,
    "mcp-cache-test-a",
  );
  if (!mintedA.success) throw new Error(mintedA.err);
  const mintedB = await createPersonalAccessToken(
    mainDb,
    TEST_EMAIL,
    "mcp-cache-test-b",
  );
  if (!mintedB.success) throw new Error(mintedB.err);

  const principalA = { token: mintedA.data.token, email: TEST_EMAIL };
  const principalB = { token: mintedB.data.token, email: TEST_EMAIL };

  try {
    // 1. Cold build.
    const first = await resolvePackageContext(principalA, runId);
    assertEquals(first.runId, runId);
    assert(
      first.sessionTools.length > 0,
      "a resolved context must carry the package's bound tools",
    );

    // 2. Warm hit — same reference, so the cache is genuinely serving.
    const second = await resolvePackageContext(principalA, runId);
    assertStrictEquals(
      second,
      first,
      "second resolve should hit the cache and return the same object",
    );

    // 3. THE PIN: the token is part of the key — a second PAT for the SAME
    // user gets its own context.
    const bFirst = await resolvePackageContext(principalB, runId);
    assert(
      bFirst !== first,
      "a different token must not share a cached context with another token",
    );
    const bSecond = await resolvePackageContext(principalB, runId);
    assertStrictEquals(bSecond, bFirst);
  } finally {
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, mintedA.data.pat.id);
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, mintedB.data.pat.id);
    await mainDb`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    await closeAllConnections();
  }
});
