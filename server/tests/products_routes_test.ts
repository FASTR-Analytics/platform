// The product plane's harness (PLAN_PRODUCTS_RESTRUCTURE step 5): the
// product, folder, slide-deck, slide and report routes exercised through the
// real registry, defineRoute, the access guard and the DB layer against the
// dev database. The Clerk leg simulates only clerkMiddleware's output
// contract, as pat_identity_parity_test.ts does; everything downstream is
// the real code.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file server/tests/products_routes_test.ts

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { Hono } from "hono";
import type { ContentSlide, GlobalUser, ProductSummary } from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import {
  deleteRunCatalogRow,
  getPinnedRunId,
} from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import { FOLDER_CYCLE } from "../db/products/mod.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { routesFolders } from "../routes/products/folders.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";

const APPROVED_EMAIL = "products-test-approved@example.com";
const UNAPPROVED_EMAIL = "products-test-unapproved@example.com";
const ID_ALPHABET = /^[23456789abcdefghjkmnpqrstuvwxyz]{4}$/;

// clerkMiddleware's output contract (@hono/clerk-auth v3): c.var.clerkAuth
// is the auth FUNCTION getAuth() invokes, tagged with the session token type;
// a signed-out request resolves to null (the middleware populates, it never
// rejects).
function clerkLegMiddleware(email: string | null) {
  const auth = email === null ? null : {
    userId: "user_products_test",
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

function productApp(email: string | null): Hono {
  const app = new Hono();
  app.use("*", clerkLegMiddleware(email) as never);
  app.route("/", routesProducts);
  app.route("/", routesFolders);
  app.route("/", routesProductSlideDecks);
  app.route("/", routesProductSlides);
  app.route("/", routesProductReports);
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
  assertEquals(res.status, 200, `${method} ${path}: ${JSON.stringify(res.body)}`);
  assert(res.body.success, `${method} ${path}: ${JSON.stringify(res.body)}`);
  return res.body.data as T;
}

function testGlobalUser(email: string, approved: boolean): GlobalUser {
  return {
    instanceName: "",
    instanceLanguage: "en",
    instanceCalendar: "gregorian",
    instanceFiscalYear: "none",
    openAccess: false,
    email,
    firstName: "",
    lastName: "",
    approved,
    isGlobalAdmin: false,
    thisUserPermissions: {
      can_configure_users: false,
      can_view_users: false,
      can_view_logs: false,
      can_configure_settings: false,
      can_configure_data: false,
      can_view_data: false,
      can_create_projects: false,
    },
    unlimitedAi: false,
  };
}

const textSlide = (markdown: string): ContentSlide => ({
  type: "content",
  header: "Slide",
  layout: {
    type: "item",
    id: "a1a",
    data: { type: "text", markdown },
  },
});

Deno.test("product routes: guard, ids, folders, package, scope, slides, delete", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set: the product routes harness must exercise the real auth branches. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const pinRes = await getPinnedRunId(mainDb);
  if (!pinRes.success) throw new Error(pinRes.err);
  const pinnedRunId = pinRes.data;
  if (pinnedRunId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  const otherReady = (
    await mainDb<{ id: string }[]>`
SELECT id FROM runs WHERE status = 'ready' AND NOT pinned ORDER BY created_at DESC LIMIT 1
`
  ).at(0);
  if (otherReady === undefined) {
    throw new Error("The dev instance needs a second ready package.");
  }
  const failedRunId = crypto.randomUUID();

  await mainDb`
    INSERT INTO users (email, is_admin) VALUES (${APPROVED_EMAIL}, FALSE)
    ON CONFLICT DO NOTHING
  `;
  await mainDb`DELETE FROM users WHERE email = ${UNAPPROVED_EMAIL}`;
  await mainDb`
    INSERT INTO runs (id, label, status, provenance)
    VALUES (${failedRunId}, 'products harness failed run', 'failed', 'wizard')
  `;

  const app = productApp(APPROVED_EMAIL);
  const createdProductIds: string[] = [];
  const createdFolderIds: string[] = [];

  try {
    // Guard: unauthenticated is 401, unapproved is 403, on a read and a write.
    const anonymous = productApp(null);
    assertEquals((await call(anonymous, "GET", "/products/xxxx/slide-deck")).status, 401);
    assertEquals(
      (await call(anonymous, "POST", "/products", { type: "slide_deck", folderId: null })).status,
      401,
    );
    const unapproved = productApp(UNAPPROVED_EMAIL);
    assertEquals((await call(unapproved, "GET", "/products/xxxx/slide-deck")).status, 403);
    assertEquals(
      (await call(unapproved, "POST", "/products", { type: "slide_deck", folderId: null })).status,
      403,
    );
    assertEquals(
      (await call(unapproved, "POST", "/folders", { label: "x", color: null, parentId: null })).status,
      403,
    );

    // Create a deck and a report: 4-char ids, localised label, run_id = pin.
    const deck = await ok<{ productId: string }>(app, "POST", "/products", {
      type: "slide_deck",
      folderId: null,
    });
    createdProductIds.push(deck.productId);
    const report = await ok<{ productId: string }>(app, "POST", "/products", {
      type: "report",
      folderId: null,
    });
    createdProductIds.push(report.productId);
    assert(ID_ALPHABET.test(deck.productId), deck.productId);
    assert(ID_ALPHABET.test(report.productId), report.productId);
    const rows = await mainDb<
      { id: string; type: string; label: string; run_id: string; admin_area_2: string | null; created_by: string }[]
    >`SELECT id, type, label, run_id, admin_area_2, created_by FROM products WHERE id = ANY(${createdProductIds})`;
    const byId = new Map(rows.map((r) => [r.id, r]));
    assertEquals(byId.get(deck.productId)?.label, "Untitled deck");
    assertEquals(byId.get(report.productId)?.label, "Untitled report");
    for (const r of rows) {
      assertEquals(r.run_id, pinnedRunId);
      assertEquals(r.admin_area_2, null);
      assertEquals(r.created_by, APPROVED_EMAIL);
    }
    const detailCounts = (
      await mainDb<{ decks: number; reports: number }[]>`
        SELECT
          (SELECT count(*)::int FROM slide_decks WHERE id = ${deck.productId}) AS decks,
          (SELECT count(*)::int FROM reports WHERE id = ${report.productId}) AS reports
      `
    )[0];
    assertEquals(detailCounts, { decks: 1, reports: 1 });

    // `starting` carries both with the trimmed summary shape, and an
    // unapproved connection carries no products, folders or ready packages.
    const approvedState = await buildInstanceState(
      mainDb,
      testGlobalUser(APPROVED_EMAIL, true),
    );
    if (!approvedState.success) throw new Error(approvedState.err);
    const summaries = new Map(
      approvedState.data.products.map((p) => [p.id, p] as const),
    );
    const deckSummary = summaries.get(deck.productId) as ProductSummary;
    const reportSummary = summaries.get(report.productId) as ProductSummary;
    assertEquals(deckSummary.type, "slide_deck");
    assertEquals(
      deckSummary.type === "slide_deck" ? deckSummary.firstSlideId : "x",
      null,
    );
    assertEquals(reportSummary.type, "report");
    assertEquals(
      reportSummary.type === "report" ? reportSummary.hasEmbeds : true,
      false,
    );
    assertEquals(Object.keys(deckSummary).sort(), [
      "adminArea2",
      "createdAt",
      "createdBy",
      "firstSlideId",
      "folderId",
      "id",
      "label",
      "lastUpdated",
      "runId",
      "type",
    ]);
    assertEquals(
      approvedState.data.lastUpdated.products[deck.productId],
      deckSummary.lastUpdated,
    );
    assert(approvedState.data.readyPackages.some((p) => p.id === pinnedRunId));
    assert(approvedState.data.readyPackages.every((p) => p.id !== failedRunId));
    const unapprovedState = await buildInstanceState(
      mainDb,
      testGlobalUser(UNAPPROVED_EMAIL, false),
    );
    if (!unapprovedState.success) throw new Error(unapprovedState.err);
    assertEquals(unapprovedState.data.currentUserApproved, false);
    assertEquals(unapprovedState.data.products, []);
    assertEquals(unapprovedState.data.folders, []);
    assertEquals(unapprovedState.data.readyPackages, []);
    assertEquals(unapprovedState.data.lastUpdated, { products: {}, slides: {} });

    // Package: a ready run is accepted, a non-ready run is refused in the
    // UPDATE and leaves the pointer alone.
    await ok(app, "PUT", `/products/${deck.productId}/package`, {
      runId: otherReady.id,
    });
    const refused = await call(app, "PUT", `/products/${deck.productId}/package`, {
      runId: failedRunId,
    });
    assertEquals(refused.body.success, false);
    const pointer = (
      await mainDb<{ run_id: string }[]>`SELECT run_id FROM products WHERE id = ${deck.productId}`
    )[0];
    assertEquals(pointer.run_id, otherReady.id);

    // Scope.
    await ok(app, "PUT", `/products/${deck.productId}/scope`, {
      adminArea2: "Harness Area",
    });
    const scoped = (
      await mainDb<{ admin_area_2: string | null }[]>`SELECT admin_area_2 FROM products WHERE id = ${deck.productId}`
    )[0];
    assertEquals(scoped.admin_area_2, "Harness Area");

    // Folders: three nested, a cycle refused, the middle one deleted.
    const folderA = await ok<{ folderId: string }>(app, "POST", "/folders", {
      label: "Harness A",
      color: null,
      parentId: null,
    });
    createdFolderIds.push(folderA.folderId);
    const folderB = await ok<{ folderId: string }>(app, "POST", "/folders", {
      label: "Harness B",
      color: "#ff0000",
      parentId: folderA.folderId,
    });
    createdFolderIds.push(folderB.folderId);
    const folderC = await ok<{ folderId: string }>(app, "POST", "/folders", {
      label: "Harness C",
      color: null,
      parentId: folderB.folderId,
    });
    createdFolderIds.push(folderC.folderId);
    const cycle = await call(app, "PUT", `/folders/${folderA.folderId}`, {
      label: "Harness A",
      color: null,
      parentId: folderC.folderId,
    });
    assertEquals(cycle.body, { success: false, err: FOLDER_CYCLE });
    const selfCycle = await call(app, "PUT", `/folders/${folderA.folderId}`, {
      label: "Harness A",
      color: null,
      parentId: folderA.folderId,
    });
    assertEquals(selfCycle.body, { success: false, err: FOLDER_CYCLE });
    await ok(app, "PUT", "/products/folder", {
      productIds: [report.productId],
      folderId: folderB.folderId,
    });
    const freed = await ok<{ freedProductIds: string[] }>(
      app,
      "DELETE",
      `/folders/${folderB.folderId}`,
    );
    assertEquals(freed.freedProductIds, [report.productId]);
    const reparented = (
      await mainDb<{ parent_id: string | null }[]>`SELECT parent_id FROM folders WHERE id = ${folderC.folderId}`
    )[0];
    assertEquals(reparented.parent_id, folderA.folderId);
    const reportFolder = (
      await mainDb<{ folder_id: string | null }[]>`SELECT folder_id FROM products WHERE id = ${report.productId}`
    )[0];
    assertEquals(reportFolder.folder_id, folderA.folderId);

    // Slides in the first deck, then a duplicate carrying the same pair, then
    // two slides copied to the duplicate with their configs verbatim.
    const slide1 = await ok<{ slideId: string }>(app, "POST", `/products/${deck.productId}/slides`, {
      position: { toEnd: true },
      slide: textSlide("one"),
    });
    const slide2 = await ok<{ slideId: string }>(app, "POST", `/products/${deck.productId}/slides`, {
      position: { toEnd: true },
      slide: textSlide("two"),
    });
    assert(ID_ALPHABET.test(slide1.slideId), slide1.slideId);
    const copy = await ok<{ productId: string }>(
      app,
      "POST",
      `/products/${deck.productId}/duplicate`,
    );
    createdProductIds.push(copy.productId);
    const pairs = await mainDb<
      { id: string; run_id: string; admin_area_2: string | null; label: string }[]
    >`SELECT id, run_id, admin_area_2, label FROM products WHERE id IN (${deck.productId}, ${copy.productId})`;
    assertEquals(new Set(pairs.map((p) => p.run_id)), new Set([otherReady.id]));
    assertEquals(new Set(pairs.map((p) => p.admin_area_2)), new Set(["Harness Area"]));
    assertEquals(pairs.find((p) => p.id === copy.productId)?.label, "Untitled deck (copy)");
    const copied = await ok<{ newSlideIds: string[] }>(
      app,
      "POST",
      `/products/${deck.productId}/slides/copy-to-slide-deck`,
      { slideIds: [slide1.slideId, slide2.slideId], targetProductId: copy.productId },
    );
    assertEquals(copied.newSlideIds.length, 2);
    const configs = await mainDb<{ id: string; config: string; slide_deck_id: string }[]>`
      SELECT id, config, slide_deck_id FROM slides
      WHERE id IN (${slide1.slideId}, ${slide2.slideId}, ${copied.newSlideIds[0]}, ${copied.newSlideIds[1]})
    `;
    const configOf = (id: string) => configs.find((c) => c.id === id)!;
    assertEquals(configOf(copied.newSlideIds[0]).config, configOf(slide1.slideId).config);
    assertEquals(configOf(copied.newSlideIds[1]).config, configOf(slide2.slideId).config);
    assertEquals(configOf(copied.newSlideIds[0]).slide_deck_id, copy.productId);
    const targetSlides = await ok<{ id: string }[]>(app, "GET", `/products/${copy.productId}/slides`);
    assertEquals(targetSlides.length, 4);

    // A slide id under the wrong product is a 404; under its own it reads.
    const wrong = await call(app, "GET", `/products/${report.productId}/slides/${slide1.slideId}`);
    assertEquals(wrong.status, 404);
    assertEquals(wrong.body.success, false);
    const right = await ok<{ id: string; deckId: string }>(
      app,
      "GET",
      `/products/${deck.productId}/slides/${slide1.slideId}`,
    );
    assertEquals(right.deckId, deck.productId);

    // The delete guard refuses while a product points at the run.
    const guarded = await deleteRunCatalogRow(mainDb, otherReady.id);
    assertEquals(guarded.success, false);
    assert(!guarded.success && guarded.err.includes("in use"), JSON.stringify(guarded));

    // One batch delete of every product: CASCADE takes the slides with them.
    const deleted = await ok<{ deletedIds: string[] }>(app, "DELETE", "/products", {
      productIds: createdProductIds,
    });
    assertEquals(new Set(deleted.deletedIds), new Set(createdProductIds));
    const remaining = (
      await mainDb<{ products: number; slides: number }[]>`
        SELECT
          (SELECT count(*)::int FROM products WHERE id = ANY(${createdProductIds})) AS products,
          (SELECT count(*)::int FROM slides WHERE slide_deck_id = ANY(${createdProductIds})) AS slides
      `
    )[0];
    assertEquals(remaining, { products: 0, slides: 0 });
    assertNotEquals(deleted.deletedIds.length, 0);
    createdProductIds.length = 0;
  } finally {
    if (createdProductIds.length > 0) {
      await mainDb`DELETE FROM products WHERE id = ANY(${createdProductIds})`;
    }
    if (createdFolderIds.length > 0) {
      await mainDb`DELETE FROM folders WHERE id = ANY(${createdFolderIds})`;
    }
    await mainDb`DELETE FROM runs WHERE id = ${failedRunId}`;
    await mainDb`DELETE FROM users WHERE email = ${APPROVED_EMAIL}`;
    await closeAllConnections();
  }
});
