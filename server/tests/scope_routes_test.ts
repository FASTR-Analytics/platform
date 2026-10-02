// The scope routes end to end (PLAN_SCOPES step 6), as a global admin on the
// dev database: the reserved "All data" scope is there, it can be neither
// edited nor deleted, and the routes take only the per-family definition. The
// Clerk leg simulates only clerkMiddleware's output contract, as
// products_routes_test.ts does.
//
// Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/scope_routes_test.ts

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import {
  ALL_DATA_DEFINITION_HASH,
  ALL_DATA_SCOPE_DEFINITION,
  ALL_DATA_SCOPE_ID,
  geographyOnlyScopeDefinition,
  type Scope,
  type ScopeDefinition,
  type ScopeUuid,
  TC,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  getScope,
  SCOPE_LABEL_RESERVED,
  SCOPE_RESERVED,
} from "../db/instance/scopes.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { routesScopes } from "../routes/instance/scopes.ts";

const ADMIN_EMAIL = "scope-routes-test-admin@example.com";

function adminApp(): Hono {
  const auth = {
    userId: `user_${ADMIN_EMAIL}`,
    tokenType: "session_token",
    sessionClaims: { email: ADMIN_EMAIL, firstName: null, lastName: null },
  };
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("clerkAuth" as never, (() => auth) as never);
    await next();
  });
  app.route("/", routesScopes);
  return app;
}

type Envelope =
  | { success: true; data?: unknown }
  | { success: false; err: string };

async function call(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope }> {
  const res = await app.request(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

Deno.test("scope routes: All data is reserved, and only the per-family definition is taken", async () => {
  if (_BYPASS_AUTH) {
    throw new Error("Run with BYPASS_AUTH= so the admin guard is exercised.");
  }
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${ADMIN_EMAIL}, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
  `;
  const app = adminApp();
  const tag = crypto.randomUUID().slice(0, 8);
  const created: ScopeUuid[] = [];
  const allData = async (): Promise<Scope> => {
    const res = await getScope(mainDb, ALL_DATA_SCOPE_ID);
    if (!res.success) throw new Error(res.err);
    return res.data;
  };

  try {
    const before = await allData();
    assertEquals(before.label, "All data");
    assertEquals(before.definition, ALL_DATA_SCOPE_DEFINITION);
    assertEquals(before.definitionHash, ALL_DATA_DEFINITION_HASH);

    // Neither its label nor its definition can be changed, and it cannot be
    // deleted, whether or not a product carries it.
    const edits = [
      { label: `Renamed ${tag}`, definition: ALL_DATA_SCOPE_DEFINITION },
      { label: "All data", definition: geographyOnlyScopeDefinition("Kano") },
    ];
    for (const body of edits) {
      const res = await call(app, "PUT", `/scopes/${ALL_DATA_SCOPE_ID}`, body);
      assertEquals(res.status, 403);
      assertEquals(res.body, { success: false, err: SCOPE_RESERVED });
    }
    const del = await call(app, "DELETE", `/scopes/${ALL_DATA_SCOPE_ID}`);
    assertEquals(del.status, 403);
    assertEquals(del.body, { success: false, err: SCOPE_RESERVED });
    assertEquals(await allData(), before);

    // A scope id is the reserved id or a UUID.
    assertEquals(
      (await call(app, "DELETE", "/scopes/not-a-scope-id")).status,
      400,
    );

    // An ordinary scope is created, edited and deleted.
    const made = await call(app, "POST", "/scopes", {
      label: `Routes ${tag}`,
      definition: geographyOnlyScopeDefinition(`Routes Area ${tag}`),
    });
    assertEquals(made.status, 200);
    assert(made.body.success);
    const scopeId = (made.body.data as { scopeId: ScopeUuid }).scopeId;
    created.push(scopeId);
    const edited: ScopeDefinition = {
      ...ALL_DATA_SCOPE_DEFINITION,
      hfa: { include: false },
      iceh: {
        include: true,
        modules: null,
        indicators: ["cov_a"],
        years: { start: 2020, end: 2022 },
      },
    };
    const put = await call(app, "PUT", `/scopes/${scopeId}`, {
      label: `Routes ${tag}`,
      definition: edited,
    });
    assertEquals(put.status, 200);
    assert(put.body.success, JSON.stringify(put.body));
    const stored = await getScope(mainDb, scopeId);
    assert(stored.success);
    assertEquals(stored.data.definition, edited);

    // Refused by the schema: an empty list, the definition shape scopes had
    // before sections, and a label already taken by "All data".
    const refused = [
      {
        ...ALL_DATA_SCOPE_DEFINITION,
        hmis: { ...ALL_DATA_SCOPE_DEFINITION.hmis, modules: [] },
      },
      {
        ...ALL_DATA_SCOPE_DEFINITION,
        hfa: { ...ALL_DATA_SCOPE_DEFINITION.hfa, timePoints: [] },
      },
      {
        ...ALL_DATA_SCOPE_DEFINITION,
        hfa: { ...ALL_DATA_SCOPE_DEFINITION.hfa, categories: [] },
      },
      {
        ...ALL_DATA_SCOPE_DEFINITION,
        hfa: { ...ALL_DATA_SCOPE_DEFINITION.hfa, serviceCategories: [] },
      },
      {
        geography: null,
        time: { years: null, hfaTimePoints: null },
        modules: null,
        indicators: { hmis: null, hfa: null, iceh: null },
      },
    ];
    for (const definition of refused) {
      const res = await call(app, "PUT", `/scopes/${scopeId}`, {
        label: `Routes ${tag}`,
        definition,
      });
      assertEquals(res.status, 400, JSON.stringify(definition));
      const post = await call(app, "POST", "/scopes", {
        label: `Routes refused ${tag}`,
        definition,
      });
      assertEquals(post.status, 400, JSON.stringify(definition));
    }
    const taken = await call(app, "POST", "/scopes", {
      label: "all DATA",
      definition: ALL_DATA_SCOPE_DEFINITION,
    });
    assertEquals(taken.body.success, false);
    // "All data" in any language is refused as a new label and as a rename:
    // the reserved scope is shown under its translated label.
    for (const reserved of Object.values(TC.allData)) {
      for (const label of [reserved, reserved.toUpperCase()]) {
        const createdAs = await call(app, "POST", "/scopes", {
          label,
          definition: geographyOnlyScopeDefinition(`Routes Area ${tag}`),
        });
        assertEquals(createdAs.body, {
          success: false,
          err: SCOPE_LABEL_RESERVED,
        });
        const renamedTo = await call(app, "PUT", `/scopes/${scopeId}`, {
          label,
          definition: edited,
        });
        assertEquals(renamedTo.body, {
          success: false,
          err: SCOPE_LABEL_RESERVED,
        });
      }
    }
    const unchanged = await getScope(mainDb, scopeId);
    assert(unchanged.success);
    assertEquals(unchanged.data.definition, edited);

    const gone = await call(app, "DELETE", `/scopes/${scopeId}`);
    assertEquals(gone.status, 200);
    assert(gone.body.success, JSON.stringify(gone.body));
    created.pop();
  } finally {
    if (created.length > 0) {
      await mainDb`DELETE FROM scopes WHERE id = ANY(${created})`;
    }
    await mainDb`
      DELETE FROM scopes WHERE label = ${`Routes refused ${tag}`}
    `;
    await mainDb`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`;
    await closeAllConnections();
  }
});
