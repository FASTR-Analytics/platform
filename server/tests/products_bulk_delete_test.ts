// The Products page's bulk delete: one deleteProducts call naming many ids,
// through the real registry, the product guard at `own` and the DB layer, on
// the dev database, through the route-test harness. Pins what the client's
// select mode relies on: one id the caller does not own refuses the whole
// batch and deletes nothing, so the page sends only the ids it owns; an id
// that names no row is skipped, and the response names exactly what went.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/products_bulk_delete_test.ts

import { assertEquals } from "@std/assert";
import type { Hono } from "hono";
import { ALL_DATA_SCOPE_ID, type APIResponseWithData } from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { routesProducts } from "../routes/products/products.ts";
import { appFor, assertRealAuth, call, ok } from "./_harness/route_app.ts";

const OWNER = "products-bulk-delete-test-owner@example.com";
const OTHER = "products-bulk-delete-test-other@example.com";
const USERS = [OWNER, OTHER];

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

Deno.test("deleteProducts: a multi-id batch is all or nothing at the guard", async () => {
  assertRealAuth();

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  for (const email of USERS) {
    await mainDb`
      INSERT INTO users (email, is_admin) VALUES (${email}, FALSE)
      ON CONFLICT (email) DO UPDATE SET is_admin = FALSE, all_scopes = TRUE
    `;
  }

  const owner = appFor(OWNER, routesProducts);
  const other = appFor(OTHER, routesProducts);
  const productIds: string[] = [];

  async function create(
    app: Hono,
    type: "slide_deck" | "report",
  ): Promise<string> {
    const { productId } = await ok<{ productId: string }>(
      app,
      "POST",
      "/products",
      {
        type,
        label: `Bulk delete ${type}`,
        folderId: null,
        runId,
        scopeId: ALL_DATA_SCOPE_ID,
      },
    );
    productIds.push(productId);
    return productId;
  }
  async function existing(ids: string[]): Promise<string[]> {
    const rows = await mainDb<{ id: string }[]>`
      SELECT id FROM products WHERE id = ANY(${ids}) ORDER BY id
    `;
    return rows.map((r) => r.id);
  }
  const sorted = (ids: string[]) => [...ids].sort();

  try {
    // The owner's deck and report, and the other user's report shared with
    // the owner at edit: visible and editable to the owner, not theirs to
    // delete, so the client's select mode leaves it out of "Delete N".
    const deck = await create(owner, "slide_deck");
    const report = await create(owner, "report");
    const shared = await create(other, "report");
    const grant = await call(other, "PUT", `/products/${shared}/access`, {
      defaultAccess: "none",
      grants: [{ email: OWNER, level: "edit" }],
      teamGrants: [],
    });
    assertEquals(grant.status, 200, JSON.stringify(grant.body));

    // One id below own refuses the whole batch at the guard, before the
    // handler: nothing is deleted, the owner's own two included.
    const mixed = await call(owner, "DELETE", "/products", {
      productIds: [deck, report, shared],
    });
    assertEquals(mixed.status, 403, JSON.stringify(mixed.body));
    assertEquals(mixed.body.success, false);
    assertEquals(
      await existing([deck, report, shared]),
      sorted([deck, report, shared]),
    );

    // The same refusal for an editor naming only the product they edit.
    assertEquals(
      (await call(owner, "DELETE", "/products", { productIds: [shared] }))
        .status,
      403,
    );

    // The owned ids alone go in one call, with an id that names no row,
    // which passes the guard and is simply absent from deletedIds.
    const { deletedIds } = await ok<{ deletedIds: string[] }>(
      owner,
      "DELETE",
      "/products",
      { productIds: [deck, report, "zz-no-such-product"] },
    );
    assertEquals(sorted(deletedIds), sorted([deck, report]));
    assertEquals(await existing([deck, report, shared]), [shared]);

    // The other user still owns theirs and deletes it.
    const theirs = await ok<{ deletedIds: string[] }>(
      other,
      "DELETE",
      "/products",
      { productIds: [shared] },
    );
    assertEquals(theirs.deletedIds, [shared]);
    assertEquals(await existing([shared]), []);
  } finally {
    await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    await mainDb`DELETE FROM users WHERE email = ANY(${USERS})`;
    await closeAllConnections();
  }
});
