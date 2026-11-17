// The scope routes end to end on the dev database, through the route-test
// harness: the reserved "All data" scope is there, it can be neither edited
// nor deleted, the routes take only the per-family definition, every
// unrestricted user writes scopes, a restricted user writes none, a granted
// scope is changed only by a user manager, and every scope carries the
// instance's count of products on it.
//
// Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/scope_routes_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ALL_DATA_DEFINITION_HASH,
  ALL_DATA_SCOPE_DEFINITION,
  ALL_DATA_SCOPE_ID,
  geographyOnlyScopeDefinition,
  type InstanceSseMessage,
  type Scope,
  type ScopeDefinition,
  type ScopeUuid,
  TC,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { UNRESTRICTED_REQUIRED } from "../auth/refusals.ts";
import {
  getScope,
  SCOPE_GRANTED,
  SCOPE_LABEL_RESERVED,
  SCOPE_RESERVED,
} from "../db/instance/scopes.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { routesScopes } from "../routes/instance/scopes.ts";
import { routesProducts } from "../routes/products/products.ts";
import {
  appFor,
  assertRealAuth,
  call,
  captured,
} from "./_harness/route_app.ts";

const ADMIN_EMAIL = "scope-routes-test-admin@example.com";
const AUTHOR_EMAIL = "scope-routes-test-author@example.com";
const RESTRICTED_EMAIL = "scope-routes-test-restricted@example.com";
const MANAGER_EMAIL = "scope-routes-test-manager@example.com";

Deno.test("scope routes: All data is reserved, and only the per-family definition is taken", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${ADMIN_EMAIL}, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
  `;
  const app = appFor(ADMIN_EMAIL, routesScopes);
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
    const lookalikes = [
      "Toutes les donnees",
      "Toutes les donne\u0301es",
      "Toutes\u00a0les  données",
      "All\u200b data",
    ];
    for (const reserved of [...Object.values(TC.allData), ...lookalikes]) {
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

Deno.test("scope routes: unrestricted users write scopes, and a granted scope needs a user manager", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const seedUser = async (
    email: string,
    allScopes: boolean,
    configureUsers: boolean,
  ) => {
    await mainDb`
      INSERT INTO users (email, is_admin, all_scopes, can_configure_users)
      VALUES (${email}, FALSE, ${allScopes}, ${configureUsers})
      ON CONFLICT (email) DO UPDATE SET
        is_admin = FALSE,
        all_scopes = EXCLUDED.all_scopes,
        can_configure_users = EXCLUDED.can_configure_users,
        can_view_users = FALSE,
        can_view_data = FALSE,
        can_configure_data = FALSE
    `;
  };
  await seedUser(AUTHOR_EMAIL, true, false);
  await seedUser(RESTRICTED_EMAIL, false, false);
  await seedUser(MANAGER_EMAIL, true, true);
  const author = appFor(AUTHOR_EMAIL, routesScopes);
  const restricted = appFor(RESTRICTED_EMAIL, routesScopes);
  const manager = appFor(MANAGER_EMAIL, routesScopes);
  const tag = crypto.randomUUID().slice(0, 8);
  const created: ScopeUuid[] = [];
  const body = (name: string) => ({
    label: `${name} ${tag}`,
    definition: geographyOnlyScopeDefinition(`${name} Area ${tag}`),
  });
  const create = async (name: string): Promise<ScopeUuid> => {
    const res = await call(author, "POST", "/scopes", body(name));
    assertEquals(res.status, 200, JSON.stringify(res.body));
    assert(res.body.success);
    const scopeId = (res.body.data as { scopeId: ScopeUuid }).scopeId;
    created.push(scopeId);
    return scopeId;
  };

  try {
    // A user with no flags creates, edits and deletes an ungranted scope.
    const own = await create("Author");
    const put = await call(author, "PUT", `/scopes/${own}`, body("Edited"));
    assertEquals(put.status, 200, JSON.stringify(put.body));
    const del = await call(author, "DELETE", `/scopes/${own}`);
    assertEquals(del.status, 200, JSON.stringify(del.body));
    assertEquals((await getScope(mainDb, own)).success, false);

    // A restricted user writes no scope, the one they hold included.
    const granted = await create("Granted");
    await mainDb`
      INSERT INTO user_scopes (email, scope_id)
      VALUES (${RESTRICTED_EMAIL}, ${granted})
    `;
    const refused = { success: false, err: UNRESTRICTED_REQUIRED };
    const restrictedCalls = [
      await call(restricted, "POST", "/scopes", body("Restricted")),
      await call(restricted, "PUT", `/scopes/${granted}`, body("Widened")),
      await call(restricted, "DELETE", `/scopes/${granted}`),
    ];
    for (const res of restrictedCalls) {
      assertEquals(res.status, 403);
      assertEquals(res.body, refused);
    }

    // A granted scope is a user's data boundary: no flags is refused, a user
    // manager is admitted.
    const grantedRefusal = { success: false, err: SCOPE_GRANTED };
    const authorPut = await call(
      author,
      "PUT",
      `/scopes/${granted}`,
      body("Widened"),
    );
    assertEquals(authorPut.status, 403);
    assertEquals(authorPut.body, grantedRefusal);
    const authorDel = await call(author, "DELETE", `/scopes/${granted}`);
    assertEquals(authorDel.status, 403);
    assertEquals(authorDel.body, grantedRefusal);
    const managerPut = await call(
      manager,
      "PUT",
      `/scopes/${granted}`,
      body("Managed"),
    );
    assertEquals(managerPut.status, 200, JSON.stringify(managerPut.body));
    const managed = await getScope(mainDb, granted);
    assert(managed.success);
    assertEquals(managed.data.label, `Managed ${tag}`);
    const managerDel = await call(manager, "DELETE", `/scopes/${granted}`);
    assertEquals(managerDel.status, 200, JSON.stringify(managerDel.body));
    assertEquals((await getScope(mainDb, granted)).success, false);
  } finally {
    await mainDb`DELETE FROM scopes WHERE id = ANY(${created})`;
    await mainDb`
      DELETE FROM users
      WHERE email = ANY(${[AUTHOR_EMAIL, RESTRICTED_EMAIL, MANAGER_EMAIL]})
    `;
    await closeAllConnections();
  }
});

Deno.test("scope routes: every scope carries its product count, and a product create re-broadcasts the list", async () => {
  assertRealAuth();
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const pinned = await getPinnedRunId(mainDb);
  if (!pinned.success) throw new Error(pinned.err);
  if (pinned.data === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  const runId = pinned.data;
  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${ADMIN_EMAIL}, TRUE)
    ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
  `;
  const app = appFor(ADMIN_EMAIL, routesScopes, routesProducts);
  const tag = crypto.randomUUID().slice(0, 8);
  let scopeId: ScopeUuid | undefined;
  let productId: string | undefined;
  const countIn = (messages: InstanceSseMessage[]): number | undefined =>
    messages.flatMap((m) =>
      m.type === "scopes_updated"
        ? m.data.scopes.filter((s) => s.id === scopeId)
        : []
    ).at(-1)?.productCount;

  try {
    const createdScope = await captured(async () => {
      const res = await call(app, "POST", "/scopes", {
        label: `Count ${tag}`,
        definition: geographyOnlyScopeDefinition(`Count Area ${tag}`),
      });
      assertEquals(res.status, 200, JSON.stringify(res.body));
      assert(res.body.success);
      scopeId = (res.body.data as { scopeId: ScopeUuid }).scopeId;
    });
    assertEquals(countIn(createdScope), 0);

    const createdProduct = await captured(async () => {
      const res = await call(app, "POST", "/products", {
        type: "report",
        label: `Count ${tag}`,
        folderId: null,
        runId,
        scopeId,
      });
      assertEquals(res.status, 200, JSON.stringify(res.body));
      assert(res.body.success);
      productId = (res.body.data as { productId: string }).productId;
    });
    assertEquals(countIn(createdProduct), 1);
    assert(scopeId !== undefined);
    const stored = await getScope(mainDb, scopeId);
    assert(stored.success);
    assertEquals(stored.data.productCount, 1);
  } finally {
    if (productId !== undefined) {
      await mainDb`DELETE FROM products WHERE id = ${productId}`;
    }
    if (scopeId !== undefined) {
      await mainDb`DELETE FROM scopes WHERE id = ${scopeId}`;
    }
    await mainDb`DELETE FROM users WHERE email = ${ADMIN_EMAIL}`;
    await closeAllConnections();
  }
});
