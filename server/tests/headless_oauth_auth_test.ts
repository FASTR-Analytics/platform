// The OAuth branch of the headless credential seam (PLAN_MCP_OAUTH step 3b).
//
// WHY THIS EXISTS: Clerk's verifier NEVER throws. It folds every failure —
// unknown token, wrong secret key, HTTP 500, DNS failure — into the same
// non-throwing signed-out state, distinguished only by a `reason` string. The
// resolver's whole job is to split that undifferentiated blob into the two
// answers the callers need:
//
//   null  → 401 "your credential is bad"   (client should re-authenticate)
//   throw → 503 "we could not judge it"    (client should retry)
//
// Getting this backwards is silent and expensive: mapping an outage to 401
// makes every connected client discard a perfectly good grant and drags every
// user back through the consent screen. So the mapping is allow-listed toward
// throwing, and these cases pin it.
//
// The mock is at the FETCH boundary, not at a seam carved into the production
// module: the real Clerk client runs, builds the real URLs, and parses real
// response bodies. That also pins the two Backend API calls the branch makes
// (verify, then users.getUser) and the primary-email selection.
//
// HOW THE STUB IS INSTALLED, and why it looks like this: @clerk/backend does
// `globalFetch = fetch.bind(globalThis)` at MODULE LOAD. Reassigning
// globalThis.fetch after importing the resolver therefore does nothing, and the
// first draft of this test silently made real network calls to Clerk (every
// case came back 404 → null, so the two "must throw" cases failed and the
// mapping was never actually exercised). So: install the stub FIRST, then reach
// the resolver through a dynamic import, so Clerk's bind captures the stub. The
// stub is a stable dispatcher that delegates to a swappable handler, because
// the bind only happens once.
//
// Run with the dev .env so the Clerk keys are present (no network is touched):
//   BYPASS_AUTH= deno test -A --env-file server/tests/headless_oauth_auth_test.ts

import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";

const USER_ID = "user_2oauthtestTESTtestTESTtest";
const PRIMARY_EMAIL_ID = "idn_primary";
const PRIMARY_EMAIL = "oauth-user@example.com";

type Handler = (url: string) => Response;

let currentHandler: Handler | null = null;
let calls: string[] = [];

// Installed BEFORE the dynamic import below — see the header note.
globalThis.fetch = ((input: string | URL | Request) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.href
    : input.url;
  calls.push(url);
  if (currentHandler === null) {
    // Loud, not silent: an unstubbed call means this test is talking to the
    // real Clerk API, which is exactly the bug this arrangement exists to stop.
    return Promise.reject(
      new Error(`Unstubbed fetch in headless OAuth test: ${url}`),
    );
  }
  return Promise.resolve(currentHandler(url));
}) as typeof fetch;

const { resolveHeadlessCredentialEmail } = await import("../headless_auth.ts");

function useHandler(handler: Handler) {
  currentHandler = handler;
  calls = [];
}

function useRejectingTransport(error: Error) {
  currentHandler = () => {
    throw error;
  };
  calls = [];
}

function clearHandler() {
  currentHandler = null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Every token is distinct so the positive cache in one case cannot mask
// another. (Only successes are cached, but distinct tokens keep it obvious.)
function freshToken(suffix: string): string {
  return `oat_headlessAuthTest${suffix}`;
}

// `clerk_idp_oauth_access_token` is the discriminator Clerk's deserializer
// keys on — NOT `oauth_access_token`, which is the social-provider token type.
// With the wrong value the response silently deserializes to something with no
// `subject`, and the resolver sees a verified token carrying no userId.
function verifiedTokenBody() {
  return {
    object: "clerk_idp_oauth_access_token",
    id: "oat_id_1",
    client_id: "client_test",
    type: "oauth:access_token",
    subject: USER_ID,
    scopes: ["profile", "email"],
    revoked: false,
    expired: false,
    expiration: null,
    created_at: 1,
    updated_at: 1,
  };
}

function userBody(
  opts: { primaryId: string | null } = { primaryId: PRIMARY_EMAIL_ID },
) {
  return {
    object: "user",
    id: USER_ID,
    primary_email_address_id: opts.primaryId,
    email_addresses: [
      {
        object: "email_address",
        id: "idn_secondary",
        email_address: "secondary@example.com",
        verification: null,
        linked_to: [],
      },
      {
        object: "email_address",
        id: PRIMARY_EMAIL_ID,
        email_address: PRIMARY_EMAIL,
        verification: null,
        linked_to: [],
      },
    ],
  };
}

function isVerifyCall(url: string): boolean {
  return url.includes("/oauth_applications/access_tokens/verify");
}

function happyPath(): Handler {
  return (url) =>
    isVerifyCall(url)
      ? jsonResponse(200, verifiedTokenBody())
      : jsonResponse(200, userBody());
}

Deno.test("headless OAuth: a valid access token resolves to the PRIMARY email", async () => {
  useHandler(happyPath());
  try {
    const email = await resolveHeadlessCredentialEmail(
      `Bearer ${freshToken("Valid")}`,
    );
    // Not the first address in the array — the one primary_email_address_id
    // points at. This is what makes an OAuth caller and a browser login land
    // on the same FASTR user.
    assertEquals(email, PRIMARY_EMAIL);
    assertEquals(calls.length, 2, "verify + getUser");
    assertEquals(calls.filter(isVerifyCall).length, 1);
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: the resolved email is cached (no second round trip)", async () => {
  const token = freshToken("Cached");
  useHandler(happyPath());
  try {
    assertEquals(
      await resolveHeadlessCredentialEmail(`Bearer ${token}`),
      PRIMARY_EMAIL,
    );
    const afterFirst = calls.length;
    assertEquals(
      await resolveHeadlessCredentialEmail(`Bearer ${token}`),
      PRIMARY_EMAIL,
    );
    // The cache is LOAD-BEARING: without it every server action an MCP tool
    // dispatches would burn rate-limited Clerk calls.
    assertEquals(calls.length, afterFirst, "second resolve hit the cache");
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: an unknown/revoked token is 401, not 503", async () => {
  // The live shape, captured from the real API for a nonexistent token.
  useHandler(() =>
    jsonResponse(404, {
      errors: [{
        message: "OAuth Access Token not found",
        long_message: "The requested OAuth Access Token could not be found.",
        code: "oauth_access_token_not_found",
      }],
    })
  );
  try {
    assertEquals(
      await resolveHeadlessCredentialEmail(`Bearer ${freshToken("Unknown")}`),
      null,
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: a Clerk outage throws (503), never 401", async () => {
  useHandler(() =>
    jsonResponse(500, {
      errors: [{ message: "Internal server error", code: "internal_error" }],
    })
  );
  try {
    // The regression this guards: returning null here would tell every
    // connected client its grant is invalid, forcing a full re-consent for
    // what is a transient Clerk problem.
    const error = await assertRejects(
      () => resolveHeadlessCredentialEmail(`Bearer ${freshToken("Outage")}`),
    );
    assertStringIncludes(
      (error as Error).message,
      "Could not verify OAuth access token",
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: a network failure throws (503), never 401", async () => {
  useRejectingTransport(new TypeError("error sending request"));
  try {
    await assertRejects(
      () => resolveHeadlessCredentialEmail(`Bearer ${freshToken("Network")}`),
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: a bad secret key throws (503) — our fault, not the token's", async () => {
  useHandler(() =>
    jsonResponse(401, {
      errors: [{
        message: "Invalid secret key",
        code: "authentication_invalid",
      }],
    })
  );
  try {
    await assertRejects(
      () => resolveHeadlessCredentialEmail(`Bearer ${freshToken("BadKey")}`),
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: a getUser failure throws (503) — the token was fine", async () => {
  useHandler((url) =>
    isVerifyCall(url)
      ? jsonResponse(200, verifiedTokenBody())
      : jsonResponse(503, {
        errors: [{ message: "Service unavailable", code: "unavailable" }],
      })
  );
  try {
    // The token verified; only the identity lookup failed. Answering 401 here
    // would blame a valid credential for our outage.
    await assertRejects(
      () => resolveHeadlessCredentialEmail(`Bearer ${freshToken("GetUser")}`),
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless OAuth: a user with no primary email is 401", async () => {
  useHandler((url) =>
    isVerifyCall(url)
      ? jsonResponse(200, verifiedTokenBody())
      : jsonResponse(200, userBody({ primaryId: null }))
  );
  try {
    // Judged, and unmappable to a FASTR user — a bad credential, not an outage.
    assertEquals(
      await resolveHeadlessCredentialEmail(`Bearer ${freshToken("NoPrimary")}`),
      null,
    );
  } finally {
    clearHandler();
  }
});

Deno.test("headless credential seam: non-Bearer and absent headers are 401 with NO backend call", async () => {
  // No handler installed: any outbound call fails the test loudly.
  calls = [];
  assertEquals(await resolveHeadlessCredentialEmail(undefined), null);
  assertEquals(await resolveHeadlessCredentialEmail(null), null);
  assertEquals(await resolveHeadlessCredentialEmail(""), null);
  assertEquals(await resolveHeadlessCredentialEmail("Basic abc123"), null);
  assertEquals(await resolveHeadlessCredentialEmail("Bearer"), null);
  assertEquals(calls.length, 0);
});
