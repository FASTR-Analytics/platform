// Regression pin for the /mcp context cache (PLAN_112 step 4).
//
// WHY THIS EXISTS: the cache write and the post-write invalidation each
// hand-built their own `(token, projectId)` key string, with different
// separators. They never matched, so `invalidateProjectContext` silently
// deleted nothing and a report created through `create_report` was invisible
// to the very next `get_available_reports` call (the model's plausible next
// move: create it again). Nothing failed loudly — it was caught by hand during
// a live smoke, which is exactly the kind of luck a test should replace.
//
// The pin is object IDENTITY: a cached context is returned by reference, so a
// rebuild is observable without reaching into cache internals. Under the bug,
// assertion 3 gets the SAME object back and fails.
//
// Both key components are pinned: the projectId (assertions 1–3) and the token
// (assertion 4 — two PATs for the SAME user must not share a context, which is
// what makes revocation invalidation exact).
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
import {
  invalidateProjectContext,
  resolveProjectContext,
} from "../mcp/context_cache.ts";

const TEST_EMAIL = "mcp-context-cache-test@example.com";

Deno.test("/mcp context cache: invalidation actually drops the entry it cached", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set — resolveGlobalUser would short-circuit to the dev identity and the token half of the cache key would go unexercised. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

  // A global admin: resolveProjectUserAccess grants admins every
  // non-central-reporting project, so the test needs no role rows.
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${TEST_EMAIL}, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
  `;

  // Any live, non-central-reporting project — the context build runs the real
  // buildProjectState against that project's own database.
  const projects = await mainDb<{ id: string }[]>`
    SELECT id FROM projects
    WHERE is_central_reporting = FALSE AND status <> 'pending_deletion'
    ORDER BY id
    LIMIT 1
  `;
  const projectId = projects.at(0)?.id;
  if (!projectId) {
    throw new Error(
      "No live project in the dev database — this test needs one real project to build a context against.",
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
    const first = await resolveProjectContext(principalA, projectId);
    assertEquals(first.projectId, projectId);
    assert(
      first.sessionTools.length > 0,
      "a resolved context must carry the project's bound tools",
    );

    // 2. Warm hit — same reference, so the cache is genuinely serving.
    const second = await resolveProjectContext(principalA, projectId);
    assertStrictEquals(
      second,
      first,
      "second resolve should hit the cache and return the same object",
    );

    // 3. THE PIN: after invalidation the next resolve must rebuild. With the
    // key-drift bug the delete misses and this returns `first` again.
    invalidateProjectContext(principalA, projectId);
    const third = await resolveProjectContext(principalA, projectId);
    assert(
      third !== first,
      "invalidateProjectContext did not drop the entry resolveProjectContext cached — the two are keying differently",
    );
    assertEquals(third.projectId, projectId);

    // 4. The token is part of the key: a second PAT for the SAME user gets its
    // own context (each captures serverActions bound to its own token, which
    // is what makes revocation invalidation exact), and invalidating one
    // principal must not disturb the other.
    const bFirst = await resolveProjectContext(principalB, projectId);
    assert(
      bFirst !== third,
      "a different token must not share a cached context with another token",
    );
    invalidateProjectContext(principalA, projectId);
    const bSecond = await resolveProjectContext(principalB, projectId);
    assertStrictEquals(
      bSecond,
      bFirst,
      "invalidating principal A must leave principal B's context intact",
    );
  } finally {
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, mintedA.data.pat.id);
    await revokePersonalAccessToken(mainDb, TEST_EMAIL, mintedB.data.pat.id);
    await mainDb`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    await closeAllConnections();
  }
});
