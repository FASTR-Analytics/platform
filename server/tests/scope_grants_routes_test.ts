// Scope grants end to end (PLAN_SCOPES step 5): one unrestricted and one
// restricted user against the real product, folder, user and run-keyed read
// routes, the collab socket and the /mcp door check, on the dev database. The Clerk
// leg simulates only clerkMiddleware's output contract, as
// products_routes_test.ts does.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/scope_grants_routes_test.ts

import { assert, assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { Hono } from "hono";
import { AIToolFailure } from "@timroberton/panther";
import {
  ALL_SCOPES,
  type CollabServerMessage,
  geographyOnlyScopeDefinition,
  type GlobalUser,
  type RunAuthoringContext,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { createScope } from "../db/instance/scopes.ts";
import { setUserScopeAccess } from "../db/instance/users.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { _ASSETS_DIR_PATH, _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { buildGlobalUserFromDb } from "../auth/global_user.ts";
import { resolvePackageContext } from "../mcp/context_cache.ts";
import {
  COLLAB_CLOSE_ACCESS_CHANGED,
  routesCollab,
} from "../routes/instance/collab.ts";
import { routesRunGeneration } from "../routes/instance/run_generation.ts";
import { routesUsers } from "../routes/instance/users.ts";
import { routesFolders } from "../routes/products/folders.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";

const OPEN_EMAIL = "scope-grants-test-open@example.com";
const LIMITED_EMAIL = "scope-grants-test-limited@example.com";
const MINTED_EMAIL = "scope-grants-test-minted@example.com";

function clerkLegMiddleware(email: string) {
  const auth = {
    userId: `user_${email}`,
    tokenType: "session_token",
    sessionClaims: { email, firstName: null, lastName: null },
  };
  return async (
    c: { set: (k: never, v: never) => void },
    next: () => Promise<void>,
  ) => {
    c.set("clerkAuth" as never, (() => auth) as never);
    await next();
  };
}

function appFor(email: string): Hono {
  const app = new Hono();
  app.use("*", clerkLegMiddleware(email) as never);
  app.route("/", routesProducts);
  app.route("/", routesFolders);
  app.route("/", routesProductReports);
  app.route("/", routesRunGeneration);
  app.route("/", routesCollab);
  app.route("/", routesUsers);
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

async function ok<T>(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await call(app, method, path, body);
  assertEquals(res.status, 200, `${method} ${path}: ${JSON.stringify(res)}`);
  assert(res.body.success, `${method} ${path}: ${JSON.stringify(res.body)}`);
  return res.body.data as T;
}

// Subscribes to a report over a real socket and returns the first message
// about it: a sync when admitted, an error when refused.
async function subscribeReport(
  email: string,
  reportId: string,
): Promise<CollabServerMessage> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    appFor(email).fetch,
  );
  try {
    const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
    return await new Promise<CollabServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no reply")), 10_000);
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as CollabServerMessage;
        if (msg.type === "hello") {
          ws.send(JSON.stringify({
            type: "report_subscribe",
            data: { productId: reportId, reportId, stateVector: "" },
          }));
          return;
        }
        if (msg.type === "report_sync" || msg.type === "report_error") {
          clearTimeout(timer);
          ws.close();
          resolve(msg);
        }
      };
      ws.onerror = () => reject(new Error("socket error"));
    });
  } finally {
    await server.shutdown();
  }
}

// Opens a report over a real socket (a subscribe, or presence alone), runs
// `act` once the server has answered it, and returns the code the server then
// closes the socket with.
async function closeCodeAfter(
  email: string,
  reportId: string,
  act: () => Promise<unknown>,
  open: "subscribe" | "presence" = "subscribe",
): Promise<number> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    appFor(email).fetch,
  );
  try {
    const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("the socket was not closed"));
      }, 10_000);
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data) as CollabServerMessage;
        if (msg.type === "hello") {
          ws.send(JSON.stringify(
            open === "subscribe"
              ? {
                type: "report_subscribe",
                data: { productId: reportId, reportId, stateVector: "" },
              }
              : { type: "presence_update", data: { reportId } },
          ));
        } else if (
          msg.type === (open === "subscribe" ? "report_sync" : "presence_state")
        ) {
          act().catch(reject);
        } else if (msg.type === "report_error") {
          reject(new Error(msg.data.message));
        }
      };
      ws.onclose = (evt) => {
        clearTimeout(timer);
        resolve(evt.code);
      };
      ws.onerror = () => reject(new Error("socket error"));
    });
  } finally {
    await server.shutdown();
  }
}

Deno.test("scope grants: products, folders, data reads, collab and /mcp", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set: the grants harness must exercise the real auth branches. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const pinRes = await getPinnedRunId(mainDb);
  if (!pinRes.success) throw new Error(pinRes.err);
  const runId = pinRes.data;
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }

  for (const email of [OPEN_EMAIL, LIMITED_EMAIL]) {
    await mainDb`
      INSERT INTO users (email, is_admin) VALUES (${email}, FALSE)
      ON CONFLICT DO NOTHING
    `;
  }

  const tag = crypto.randomUUID().slice(0, 8);
  const grantedRes = await createScope(mainDb, {
    label: `Grants granted ${tag}`,
    definition: geographyOnlyScopeDefinition(`Grants Granted ${tag}`),
    createdBy: OPEN_EMAIL,
  });
  const otherRes = await createScope(mainDb, {
    label: `Grants other ${tag}`,
    definition: geographyOnlyScopeDefinition(`Grants Other ${tag}`),
    createdBy: OPEN_EMAIL,
  });
  if (!grantedRes.success) throw new Error(grantedRes.err);
  if (!otherRes.success) throw new Error(otherRes.err);
  const granted = grantedRes.data.scopeId;
  const other = otherRes.data.scopeId;

  const open = appFor(OPEN_EMAIL);
  const limited = appFor(LIMITED_EMAIL);
  const productIds: string[] = [];
  const folderIds: string[] = [];
  const csvName = `scope_grants_test_${tag}.csv`;

  try {
    const grant = await setUserScopeAccess(mainDb, LIMITED_EMAIL, {
      all: false,
      scopeIds: [granted],
    });
    assert(grant.success, JSON.stringify(grant));

    const limitedUser: GlobalUser = await buildGlobalUserFromDb(
      LIMITED_EMAIL,
      null,
      null,
    );
    assertEquals(limitedUser.scopeAccess, { all: false, scopeIds: [granted] });
    const openUser = await buildGlobalUserFromDb(OPEN_EMAIL, null, null);
    assertEquals(openUser.scopeAccess, ALL_SCOPES);

    // Fixtures, made by the unrestricted user: a folder holding a product in
    // the granted scope, a folder holding a product in the other.
    const visibleFolder = await ok<{ folderId: string }>(
      open,
      "POST",
      "/folders",
      { label: `Grants visible ${tag}`, color: null, parentId: null },
    );
    const hiddenFolder = await ok<{ folderId: string }>(
      open,
      "POST",
      "/folders",
      { label: `Grants hidden ${tag}`, color: null, parentId: null },
    );
    folderIds.push(visibleFolder.folderId, hiddenFolder.folderId);
    const inside = await ok<{ productId: string }>(open, "POST", "/products", {
      type: "report",
      folderId: visibleFolder.folderId,
      runId,
      scopeId: granted,
    });
    const outside = await ok<{ productId: string }>(open, "POST", "/products", {
      type: "report",
      folderId: hiddenFolder.folderId,
      runId,
      scopeId: other,
    });
    productIds.push(inside.productId, outside.productId);

    // Product list: the starting payload carries only the granted share.
    const limitedState = await buildInstanceState(mainDb, limitedUser);
    if (!limitedState.success) throw new Error(limitedState.err);
    const limitedIds = limitedState.data.products.map((p) => p.id);
    assert(limitedIds.includes(inside.productId));
    assert(!limitedIds.includes(outside.productId));
    assertEquals(limitedState.data.scopes.map((s) => s.id), [granted]);
    assertEquals(
      limitedState.data.folders.map((f) => f.id),
      [visibleFolder.folderId],
    );
    assertEquals(limitedState.data.currentUserPermissions.can_view_data, false);
    const openState = await buildInstanceState(mainDb, openUser);
    if (!openState.success) throw new Error(openState.err);
    const openIds = openState.data.products.map((p) => p.id);
    assert(openIds.includes(inside.productId));
    assert(openIds.includes(outside.productId));

    // Product detail.
    await ok(limited, "GET", `/products/${inside.productId}/report`);
    assertEquals(
      (await call(limited, "GET", `/products/${outside.productId}/report`))
        .status,
      403,
    );
    await ok(open, "GET", `/products/${outside.productId}/report`);

    // Data reads: inside a grant, outside it, and the whole package.
    const contextPath = `/run_generation/run/${runId}/authoring_context`;
    const context = await ok<RunAuthoringContext>(
      limited,
      "POST",
      contextPath,
      { scopeId: granted },
    );
    assertEquals(
      (await call(limited, "POST", contextPath, { scopeId: other })).status,
      403,
    );
    assertEquals(
      (await call(limited, "POST", contextPath, { scopeId: null })).status,
      403,
    );
    await ok(open, "POST", contextPath, { scopeId: other });
    await ok(open, "POST", contextPath, { scopeId: null });
    const metricId = context.metrics.at(0)?.id;
    assert(metricId !== undefined, "the pinned package has no metric");
    const infoPath = `/run_generation/run/${runId}/results_value_info`;
    assertEquals(
      (await call(limited, "POST", infoPath, { metricId, scopeId: granted }))
        .status,
      200,
    );
    for (const scopeId of [other, null]) {
      assertEquals(
        (await call(limited, "POST", infoPath, { metricId, scopeId })).status,
        403,
      );
      assertEquals(
        (await call(open, "POST", infoPath, { metricId, scopeId })).status,
        200,
      );
    }

    // A product's scope set to a scope the user does not hold (R14), and a
    // new product naming one.
    assertEquals(
      (await call(limited, "PUT", `/products/${inside.productId}/scope`, {
        scopeId: other,
      })).status,
      403,
    );
    assertEquals(
      (await call(limited, "POST", "/products", {
        type: "report",
        folderId: null,
        runId,
        scopeId: other,
      })).status,
      403,
    );
    await ok(limited, "PUT", `/products/${inside.productId}/scope`, {
      scopeId: granted,
    });

    // Folders (R23): no folder route, and no move into a folder the user
    // cannot see; the root and a visible folder are fine.
    assertEquals(
      (await call(limited, "POST", "/folders", {
        label: "x",
        color: null,
        parentId: null,
      })).status,
      403,
    );
    assertEquals(
      (await call(limited, "PUT", `/folders/${visibleFolder.folderId}`, {
        label: "x",
        color: null,
        parentId: null,
      })).status,
      403,
    );
    assertEquals(
      (await call(limited, "PUT", "/products/folder", {
        productIds: [inside.productId],
        folderId: hiddenFolder.folderId,
      })).status,
      403,
    );
    await ok(limited, "PUT", "/products/folder", {
      productIds: [inside.productId],
      folderId: visibleFolder.folderId,
    });
    await ok(limited, "PUT", "/products/folder", {
      productIds: [inside.productId],
      folderId: null,
    });
    // Its only visible product left it, so the folder is no longer visible.
    assertEquals(
      (await call(limited, "PUT", "/products/folder", {
        productIds: [inside.productId],
        folderId: visibleFolder.folderId,
      })).status,
      403,
    );

    // Collab: a subscribe to a product outside the grants is refused; one
    // inside them, and any for the unrestricted user, syncs.
    const refused = await subscribeReport(LIMITED_EMAIL, outside.productId);
    assertEquals(refused.type, "report_error");
    assertEquals(
      (await subscribeReport(LIMITED_EMAIL, inside.productId)).type,
      "report_sync",
    );
    assertEquals(
      (await subscribeReport(OPEN_EMAIL, outside.productId)).type,
      "report_sync",
    );

    // A socket that holds a product loses it when the product leaves the
    // user's grants: the rescope closes it, and its reconnect is refused.
    assertEquals(
      await closeCodeAfter(
        LIMITED_EMAIL,
        inside.productId,
        () =>
          ok(open, "PUT", `/products/${inside.productId}/scope`, {
            scopeId: other,
          }),
      ),
      COLLAB_CLOSE_ACCESS_CHANGED,
    );
    assertEquals(
      (await subscribeReport(LIMITED_EMAIL, inside.productId)).type,
      "report_error",
    );
    await ok(open, "PUT", `/products/${inside.productId}/scope`, {
      scopeId: granted,
    });
    // The same for a socket that only joined the product's presence.
    assertEquals(
      await closeCodeAfter(
        LIMITED_EMAIL,
        inside.productId,
        () =>
          ok(open, "PUT", `/products/${inside.productId}/scope`, {
            scopeId: other,
          }),
        "presence",
      ),
      COLLAB_CLOSE_ACCESS_CHANGED,
    );
    await ok(open, "PUT", `/products/${inside.productId}/scope`, {
      scopeId: granted,
    });

    // A socket opened under one scope access closes when an admin flag change
    // gives its user another.
    await mainDb`UPDATE users SET is_admin = TRUE WHERE email = ${OPEN_EMAIL}`;
    assertEquals(
      await closeCodeAfter(
        LIMITED_EMAIL,
        inside.productId,
        () =>
          ok(open, "POST", "/user/toggle-admin", {
            emails: [LIMITED_EMAIL],
            makeAdmin: true,
          }),
      ),
      COLLAB_CLOSE_ACCESS_CHANGED,
    );
    await ok(open, "POST", "/user/toggle-admin", {
      emails: [LIMITED_EMAIL],
      makeAdmin: false,
    });
    await mainDb`UPDATE users SET is_admin = FALSE WHERE email = ${OPEN_EMAIL}`;

    // A restricted user who manages users cannot write the admin flag, which
    // would lift their own restriction (R25): not on a new user, not on their
    // own row through the batch upload, and not by renaming an admin's row to
    // an address of their own.
    await mainDb`
      UPDATE users SET can_configure_users = TRUE WHERE email = ${LIMITED_EMAIL}
    `;
    assertEquals(
      (await call(limited, "POST", "/user", {
        emails: [MINTED_EMAIL],
        isGlobalAdmin: true,
      })).status,
      403,
    );
    await Deno.writeTextFile(
      join(_ASSETS_DIR_PATH, csvName),
      `email,is_global_admin\n${LIMITED_EMAIL},true\n`,
    );
    assertEquals(
      (await call(limited, "POST", "/users/batch", {
        asset_file_name: csvName,
        replace_all_existing: false,
      })).status,
      403,
    );
    assertEquals(
      (await buildGlobalUserFromDb(LIMITED_EMAIL, null, null)).scopeAccess,
      { all: false, scopeIds: [granted] },
    );
    await mainDb`UPDATE users SET is_admin = TRUE WHERE email = ${OPEN_EMAIL}`;
    assertEquals(
      (await call(limited, "POST", "/user/rename-email", {
        oldEmail: OPEN_EMAIL,
        newEmail: MINTED_EMAIL,
      })).status,
      403,
    );
    await mainDb`UPDATE users SET is_admin = FALSE WHERE email = ${OPEN_EMAIL}`;
    assertEquals(
      (await mainDb`SELECT 1 FROM users WHERE email = ${MINTED_EMAIL}`).length,
      0,
    );

    // /mcp reads the whole package, which a restricted user is refused.
    await assertRejects(
      () => resolvePackageContext({ token: "t", email: LIMITED_EMAIL }, runId),
      AIToolFailure,
    );
  } finally {
    if (productIds.length > 0) {
      await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    }
    if (folderIds.length > 0) {
      await mainDb`DELETE FROM folders WHERE id = ANY(${folderIds})`;
    }
    await mainDb`
      DELETE FROM users
      WHERE email IN (${OPEN_EMAIL}, ${LIMITED_EMAIL}, ${MINTED_EMAIL})
    `;
    await Deno.remove(join(_ASSETS_DIR_PATH, csvName)).catch(() => {});
    await mainDb`DELETE FROM scopes WHERE id IN (${granted}, ${other})`;
    await closeAllConnections();
  }
});
