// Regression pin for the /mcp principal key (PLAN_COPILOT02_FIXES step 7,
// D28): panther caches one core per principal key, and a core's tools close
// over the token of the request that built it, so the key must tell two
// credentials of one email apart while naming no part of either.
//
//   deno test -A --no-check --env-file server/tests/mcp_principal_key_test.ts

import { assert, assertEquals, assertMatch } from "@std/assert";
import { buildMcpPrincipal } from "../mcp/context_cache.ts";

const EMAIL = "one@example.com";

Deno.test("buildMcpPrincipal: two credentials of one email get two keys", async () => {
  const a = await buildMcpPrincipal("fastr_pat_first", EMAIL);
  const b = await buildMcpPrincipal("fastr_pat_second", EMAIL);
  assert(a.key !== b.key);
});

Deno.test("buildMcpPrincipal: one credential gets the same key every time", async () => {
  const a = await buildMcpPrincipal("fastr_pat_first", EMAIL);
  const b = await buildMcpPrincipal("fastr_pat_first", EMAIL);
  assertEquals(a.key, b.key);
  assertEquals(a.token, "fastr_pat_first");
  assertEquals(a.email, EMAIL);
});

Deno.test("buildMcpPrincipal: the key names the email and holds no part of the credential", async () => {
  const token = "fastr_pat_0123456789abcdefghijklmnop";
  const { key } = await buildMcpPrincipal(token, EMAIL);
  assertMatch(key, /^one@example\.com#[0-9a-f]{16}$/);
  for (let i = 0; i + 6 <= token.length; i++) {
    assert(!key.includes(token.slice(i, i + 6)));
  }
});
