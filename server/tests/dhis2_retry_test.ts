// Pins what withRetry throws when its attempts run out, whose contract is the
// "Retry" section of SYSTEM_07_dhis2.md. Pure: no DHIS2, no database.
//
//   deno test -A --env-file server/tests/dhis2_retry_test.ts

import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import { withRetry } from "../dhis2/common/retry_utils.ts";

function alwaysThrows() {
  const error = new Error("DHIS2 request timeout after 15000ms");
  let calls = 0;
  const fn = () => {
    calls++;
    return Promise.reject(error);
  };
  return { error, fn, calls: () => calls };
}

Deno.test("one attempt rejects with the original error, called once", async () => {
  const { error, fn, calls } = alwaysThrows();
  const thrown = await assertRejects(() => withRetry(fn, { maxAttempts: 1 }));
  assertStrictEquals(thrown, error);
  assertEquals(calls(), 1);
});

Deno.test("two attempts reject with the wrapped message, called twice", async () => {
  const { fn, calls } = alwaysThrows();
  await assertRejects(
    () =>
      withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 0,
        onRetry: () => {},
      }),
    Error,
    "Failed after 2 attempts. Last error: DHIS2 request timeout after 15000ms",
  );
  assertEquals(calls(), 2);
});

Deno.test("a refused retry rejects with the original error, called once", async () => {
  const { error, fn, calls } = alwaysThrows();
  const thrown = await assertRejects(() =>
    withRetry(fn, { maxAttempts: 3, shouldRetry: () => false })
  );
  assertStrictEquals(thrown, error);
  assertEquals(calls(), 1);
});
