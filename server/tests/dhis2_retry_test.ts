// Pins withRetry's exhaustion as the "Retry" section of SYSTEM_07_dhis2.md
// states it. No database, no network.
//
//   deno test -A --env-file server/tests/dhis2_retry_test.ts

import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { withRetry } from "../dhis2/common/retry_utils.ts";

function alwaysThrows(error: Error) {
  let calls = 0;
  return {
    fn: (): Promise<never> => {
      calls++;
      return Promise.reject(error);
    },
    calls: () => calls,
  };
}

Deno.test("one attempt rethrows the original error unchanged", async () => {
  const error = new Error("DHIS2 request timeout after 15000ms: https://dhis2.example/api");
  const { fn, calls } = alwaysThrows(error);
  const thrown = await assertRejects(() => withRetry(fn, { maxAttempts: 1 }));
  assertStrictEquals(thrown, error);
  assertEquals(calls(), 1);
});

Deno.test("two attempts wrap the last error", async () => {
  const { fn, calls } = alwaysThrows(new Error("DHIS2 API Error (503)"));
  await assertRejects(
    () => withRetry(fn, { maxAttempts: 2, initialDelayMs: 0 }),
    Error,
    "Failed after 2 attempts. Last error: DHIS2 API Error (503)",
  );
  assertEquals(calls(), 2);
});

Deno.test("an error shouldRetry refuses is rethrown unchanged after one call", async () => {
  const error = new Error("DHIS2 API Error (404)");
  const { fn, calls } = alwaysThrows(error);
  const thrown = await assertRejects(() =>
    withRetry(fn, { shouldRetry: () => false })
  );
  assertStrictEquals(thrown, error);
  assertEquals(calls(), 1);
});
