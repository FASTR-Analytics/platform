// Product levels end to end (PLAN_PRODUCT_OWNERSHIP steps 2 and 3): five
// users (owner, editor, viewer, stranger, global admin) against the real
// product, folder, slide, deck and report routes and the level-aware guard,
// the starting payload and the collab socket, on the dev database. The Clerk leg simulates only clerkMiddleware's output
// contract, as products_routes_test.ts does.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel server/tests/product_access_routes_test.ts

import { assert, assertEquals } from "@std/assert";
import { Hono } from "hono";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  COLLAB_NO_EDIT_PERMISSION,
  type CollabClientMessage,
  type CollabServerMessage,
  type ContentSlide,
  type ProductAccess,
  type ProductGrant,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  getProductSummaries,
  insertReportVersion,
  insertSlideDeckVersion,
  loadReportVersionData,
  loadSlideDeckVersionData,
  PRODUCT_ACCESS_UNKNOWN_USER,
  PRODUCT_GRANT_DUPLICATE,
  PRODUCT_GRANT_IS_OWNER,
} from "../db/products/mod.ts";
import { _BYPASS_AUTH } from "../exposed_env_vars.ts";
import { buildGlobalUserFromDb } from "../auth/global_user.ts";
import {
  COLLAB_CLOSE_ACCESS_CHANGED,
  routesCollab,
} from "../routes/instance/collab.ts";
import { routesFolders } from "../routes/products/folders.ts";
import { routesProducts } from "../routes/products/products.ts";
import { routesProductReports } from "../routes/products/reports.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";
import { buildInstanceState } from "../task_management/build_instance_state.ts";

const OWNER = "product-access-test-owner@example.com";
const EDITOR = "product-access-test-editor@example.com";
const VIEWER = "product-access-test-viewer@example.com";
const STRANGER = "product-access-test-stranger@example.com";
const ADMIN = "product-access-test-admin@example.com";
const USERS = [OWNER, EDITOR, VIEWER, STRANGER, ADMIN];

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
  app.route("/", routesProductSlideDecks);
  app.route("/", routesProductSlides);
  app.route("/", routesProductReports);
  app.route("/", routesCollab);
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

async function status(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<number> {
  return (await call(app, method, path, body)).status;
}

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
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

type CollabSocket = {
  send: (msg: CollabClientMessage) => void;
  // The first message of this type not yet taken.
  next: <T extends CollabServerMessage["type"]>(
    type: T,
  ) => Promise<Extract<CollabServerMessage, { type: T }>>;
  // Whether the server still answers a ping, or has closed the socket.
  alive: () => Promise<boolean>;
  closed: Promise<number>;
  stop: () => Promise<void>;
};

// One user's collab socket on a server of its own, once the server said
// hello.
async function collabSocket(email: string): Promise<CollabSocket> {
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    appFor(email).fetch,
  );
  const ws = new WebSocket(`ws://localhost:${server.addr.port}/collab`);
  const inbox: CollabServerMessage[] = [];
  const waiting: (() => void)[] = [];
  ws.onmessage = (evt) => {
    inbox.push(JSON.parse(evt.data));
    for (const wake of waiting.splice(0)) wake();
  };
  const closed = new Promise<number>((resolve) => {
    ws.onclose = (evt) => {
      resolve(evt.code);
      for (const wake of waiting.splice(0)) wake();
    };
  });
  let open = true;
  closed.then(() => (open = false));
  async function next<T extends CollabServerMessage["type"]>(
    type: T,
  ): Promise<Extract<CollabServerMessage, { type: T }>> {
    const deadline = Date.now() + 10_000;
    while (true) {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) {
        return inbox.splice(i, 1)[0] as Extract<
          CollabServerMessage,
          { type: T }
        >;
      }
      if (!open) throw new Error(`closed before ${type}`);
      if (Date.now() > deadline) throw new Error(`no ${type}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 200);
        waiting.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  const send = (msg: CollabClientMessage) => ws.send(JSON.stringify(msg));
  await next("hello");
  return {
    send,
    next,
    alive: async () => {
      if (!open) return false;
      send({ type: "ping" });
      return await next("pong").then(() => true, () => false);
    },
    closed,
    stop: async () => {
      if (open) ws.close();
      await closed;
      await server.shutdown();
    },
  };
}

const subscribe = (reportId: string): CollabClientMessage => ({
  type: "report_subscribe",
  data: { productId: reportId, reportId, stateVector: "" },
});

Deno.test("product levels: the guard, the access routes and the bulk action", async () => {
  if (_BYPASS_AUTH) {
    throw new Error(
      "BYPASS_AUTH is set: the levels harness must exercise the real auth branches. Unset it and re-run.",
    );
  }

  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  for (const email of USERS) {
    await mainDb`
      INSERT INTO users (email, is_admin) VALUES (${email}, ${email === ADMIN})
      ON CONFLICT (email) DO UPDATE SET is_admin = EXCLUDED.is_admin,
        all_scopes = TRUE
    `;
  }

  const owner = appFor(OWNER);
  const editor = appFor(EDITOR);
  const viewer = appFor(VIEWER);
  const stranger = appFor(STRANGER);
  const admin = appFor(ADMIN);
  const productIds: string[] = [];
  const folderIds: string[] = [];
  const sockets: CollabSocket[] = [];
  const tag = crypto.randomUUID().slice(0, 8);

  async function create(
    app: Hono,
    type: "slide_deck" | "report",
    folderId: string | null = null,
  ): Promise<string> {
    const { productId } = await ok<{ productId: string }>(
      app,
      "POST",
      "/products",
      { type, folderId, runId, scopeId: ALL_DATA_SCOPE_ID },
    );
    productIds.push(productId);
    return productId;
  }
  async function folder(parentId: string | null): Promise<string> {
    const { folderId } = await ok<{ folderId: string }>(
      owner,
      "POST",
      "/folders",
      { label: `Levels ${tag}`, color: null, parentId },
    );
    folderIds.push(folderId);
    return folderId;
  }
  const setAccess = (
    app: Hono,
    productId: string,
    defaultAccess: ProductAccess["defaultAccess"],
    grants: ProductGrant[],
  ) =>
    call(app, "PUT", `/products/${productId}/access`, {
      defaultAccess,
      grants,
    });
  async function startingPlane(email: string) {
    const state = await buildInstanceState(
      mainDb,
      await buildGlobalUserFromDb(email, null, null),
    );
    if (!state.success) throw new Error(state.err);
    return {
      productIds: state.data.products.map((p) => p.id),
      slideStamps: state.data.lastUpdated.slides,
    };
  }
  async function openOn(email: string, reportId: string) {
    const socket = await collabSocket(email);
    sockets.push(socket);
    socket.send(subscribe(reportId));
    return socket;
  }
  async function accessOf(productId: string): Promise<ProductAccess> {
    const summary = data(await getProductSummaries(mainDb, [productId])).at(0);
    assert(summary !== undefined, productId);
    return {
      owner: summary.owner,
      defaultAccess: summary.defaultAccess,
      grants: summary.grants,
    };
  }

  try {
    // The owner's deck and report, private but for an editor and a viewer.
    const deck = await create(owner, "slide_deck");
    const report = await create(owner, "report");
    const sharing: ProductGrant[] = [
      { email: EDITOR, level: "edit" },
      { email: VIEWER, level: "view" },
    ];
    for (const id of [deck, report]) {
      const res = await setAccess(owner, id, "none", sharing);
      assertEquals(res.status, 200, JSON.stringify(res.body));
    }
    const slide = await ok<{ slideId: string }>(
      owner,
      "POST",
      `/products/${deck}/slides`,
      { position: { toEnd: true }, slide: textSlide("one") },
    );
    const reportSnapshot = data(await loadReportVersionData(mainDb, report));
    const reportVersionId = data(
      await insertReportVersion(mainDb, {
        productId: report,
        createdAt: new Date().toISOString(),
        label: reportSnapshot.label,
        body: reportSnapshot.body,
        figures: reportSnapshot.figures,
        images: reportSnapshot.images,
        editors: [],
        contentHash: `levels-${tag}`,
      }),
    ).versionId;
    const deckSnapshot = data(await loadSlideDeckVersionData(mainDb, deck));
    const deckVersionId = data(
      await insertSlideDeckVersion(mainDb, {
        productId: deck,
        createdAt: new Date().toISOString(),
        label: deckSnapshot.label,
        deckConfig: deckSnapshot.deckConfig,
        slides: deckSnapshot.slides,
        editors: [],
        contentHash: `levels-${tag}`,
      }),
    ).versionId;

    // The starting payload carries a product to a viewer and not to a
    // stranger, and the deck's slide stamps go with it.
    const viewerStart = await startingPlane(VIEWER);
    assert(viewerStart.productIds.includes(deck));
    assert(viewerStart.productIds.includes(report));
    assert(slide.slideId in viewerStart.slideStamps);
    const strangerStart = await startingPlane(STRANGER);
    assert(!strangerStart.productIds.includes(deck));
    assert(!strangerStart.productIds.includes(report));
    assert(!(slide.slideId in strangerStart.slideStamps));

    // A stranger holds none: both detail reads are refused.
    assertEquals(
      await status(stranger, "GET", `/products/${deck}/slide-deck`),
      403,
    );
    assertEquals(
      await status(stranger, "GET", `/products/${report}/report`),
      403,
    );

    // A viewer reads, lists versions and duplicates; every write is refused.
    await ok(viewer, "GET", `/products/${deck}/slide-deck`);
    await ok(viewer, "GET", `/products/${report}/report`);
    await ok(viewer, "GET", `/products/${deck}/slides`);
    await ok(viewer, "GET", `/products/${deck}/slide-deck/versions`);
    await ok(viewer, "GET", `/products/${report}/report/versions`);
    const viewerCopy = await ok<{ productId: string }>(
      viewer,
      "POST",
      `/products/${report}/duplicate`,
      { scopeId: ALL_DATA_SCOPE_ID },
    );
    productIds.push(viewerCopy.productId);
    const viewerRestoreCopy = await ok<{ productId: string }>(
      viewer,
      "POST",
      `/products/${report}/report/versions/${reportVersionId}/copy`,
      { label: "Viewer's copy", folderId: null },
    );
    productIds.push(viewerRestoreCopy.productId);
    for (const id of [viewerCopy.productId, viewerRestoreCopy.productId]) {
      assertEquals(await accessOf(id), {
        owner: VIEWER,
        defaultAccess: "none",
        grants: [],
      });
    }

    const writes: [string, string, unknown][] = [
      ["POST", `/products/${deck}/slides`, {
        position: { toEnd: true },
        slide: textSlide("two"),
      }],
      ["PUT", `/products/${report}/report/body`, { body: "Edited" }],
      ["PUT", `/products/${report}/label`, { label: `Renamed ${tag}` }],
      ["PUT", "/products/folder", { productIds: [report], folderId: null }],
      ["PUT", `/products/${report}/scope`, { scopeId: ALL_DATA_SCOPE_ID }],
      ["PUT", `/products/${report}/package`, { runId }],
      [
        "POST",
        `/products/${report}/report/versions/${reportVersionId}/restore`,
        undefined,
      ],
      ["PUT", `/products/${report}/access`, {
        defaultAccess: "none",
        grants: sharing,
      }],
    ];
    for (const [method, path, body] of writes) {
      assertEquals(
        await status(viewer, method, path, body),
        403,
        `viewer ${method} ${path}`,
      );
    }

    // An editor makes every one of those writes, and may not delete or
    // transfer; the owner may do both.
    for (const [method, path, body] of writes) {
      await ok(editor, method, path, body);
    }
    assertEquals(
      await status(editor, "DELETE", "/products", { productIds: [report] }),
      403,
    );
    assertEquals(
      await status(editor, "PUT", `/products/${report}/owner`, {
        email: EDITOR,
      }),
      403,
    );
    const spare = await create(owner, "report");
    await ok(owner, "PUT", `/products/${spare}/owner`, { email: VIEWER });
    await ok(viewer, "PUT", `/products/${spare}/owner`, { email: OWNER });
    await ok(owner, "DELETE", "/products", { productIds: [spare] });

    // The admin deletes a product it holds no grant on.
    const adminTarget = await create(owner, "report");
    await ok(admin, "DELETE", "/products", { productIds: [adminTarget] });

    // Levels are additive (R8): the higher of the grant and the general
    // access wins, either way round.
    assertEquals(
      (await setAccess(owner, report, "view", [
        { email: VIEWER, level: "edit" },
      ])).status,
      200,
    );
    await ok(viewer, "PUT", `/products/${report}/label`, { label: "A" });
    assertEquals(
      (await setAccess(owner, report, "edit", [
        { email: VIEWER, level: "view" },
      ])).status,
      200,
    );
    await ok(viewer, "PUT", `/products/${report}/label`, { label: "B" });
    assertEquals(
      (await setAccess(owner, report, "none", sharing)).status,
      200,
    );

    // copySlidesToSlideDeck: view on the source and edit on the destination
    // pass; view on the destination is refused.
    const viewerDeck = await ok<{ productId: string }>(
      viewer,
      "POST",
      `/products/${deck}/duplicate`,
      { scopeId: ALL_DATA_SCOPE_ID },
    );
    productIds.push(viewerDeck.productId);
    await ok(viewer, "POST", `/products/${deck}/slides/copy-to-slide-deck`, {
      slideIds: [slide.slideId],
      targetProductId: viewerDeck.productId,
    });
    const viewerSlides = await ok<{ id: string }[]>(
      viewer,
      "GET",
      `/products/${viewerDeck.productId}/slides`,
    );
    assertEquals(
      await status(
        viewer,
        "POST",
        `/products/${viewerDeck.productId}/slides/copy-to-slide-deck`,
        { slideIds: [viewerSlides[0].id], targetProductId: deck },
      ),
      403,
    );
    const viewerDeckCopy = await ok<{ productId: string }>(
      viewer,
      "POST",
      `/products/${deck}/slide-deck/versions/${deckVersionId}/copy`,
      { label: "Viewer's deck copy", folderId: null },
    );
    productIds.push(viewerDeckCopy.productId);
    assertEquals((await accessOf(viewerDeckCopy.productId)).owner, VIEWER);

    // setProductAccess refuses the owner as a grantee, an unknown email and a
    // repeated email, through the envelope, and changes nothing.
    const before = await accessOf(report);
    const refusals: [ProductGrant[], string][] = [
      [[{ email: OWNER, level: "edit" }], PRODUCT_GRANT_IS_OWNER],
      [
        [{ email: `nobody-${tag}@example.com`, level: "view" }],
        PRODUCT_ACCESS_UNKNOWN_USER,
      ],
      [
        [{ email: VIEWER, level: "view" }, { email: VIEWER, level: "edit" }],
        PRODUCT_GRANT_DUPLICATE,
      ],
    ];
    for (const [grants, err] of refusals) {
      const res = await setAccess(owner, report, "none", grants);
      assertEquals(res, { status: 200, body: { success: false, err } });
    }
    assertEquals(await accessOf(report), before);

    // The collab socket: a viewer's subscribe is admitted and its update
    // refused; a stranger's subscribe is refused.
    const viewerSocket = await openOn(VIEWER, report);
    await viewerSocket.next("report_sync");
    viewerSocket.send({
      type: "report_update",
      data: { productId: report, reportId: report, update: "AA==" },
    });
    const refusedUpdate = await viewerSocket.next("report_error");
    assertEquals(refusedUpdate.data.message, COLLAB_NO_EDIT_PERMISSION);
    assert(!refusedUpdate.data.fatal);
    const strangerSocket = await openOn(STRANGER, report);
    const refusedSubscribe = await strangerSocket.next("report_error");
    assert(refusedSubscribe.data.fatal);

    // Lowering the viewer to none closes their socket and leaves the
    // editor's open.
    const editorSocket = await openOn(EDITOR, report);
    await editorSocket.next("report_sync");
    assertEquals(
      (await setAccess(owner, report, "none", [
        { email: EDITOR, level: "edit" },
      ])).status,
      200,
    );
    assertEquals(await viewerSocket.closed, COLLAB_CLOSE_ACCESS_CHANGED);
    assert(await editorSocket.alive());
    assertEquals(
      (await setAccess(owner, report, "none", sharing)).status,
      200,
    );

    // A transfer to the editor moves the owner from own to edit and the
    // editor from edit to own: neither socket's standing changes.
    const ownerSocket = await openOn(OWNER, report);
    await ownerSocket.next("report_sync");

    // setProductOwner: the previous owner becomes an edit grantee and the new
    // owner's grant goes.
    await ok(owner, "PUT", `/products/${report}/owner`, { email: EDITOR });
    assert(await ownerSocket.alive());
    assert(await editorSocket.alive());
    assertEquals(await accessOf(report), {
      owner: EDITOR,
      defaultAccess: "none",
      grants: [
        { email: OWNER, level: "edit" },
        { email: VIEWER, level: "view" },
      ],
    });

    // A product with no owner at view, as the fleet deploy leaves the
    // consolidated ones (R3): no non-admin deletes it, and the admin sets
    // its owner.
    const ownerless = await create(owner, "report");
    await mainDb`
      UPDATE products SET owner = NULL, default_access = 'view'
      WHERE id = ${ownerless}
    `;
    for (const app of [owner, editor, stranger]) {
      assertEquals(
        await status(app, "DELETE", "/products", { productIds: [ownerless] }),
        403,
      );
    }
    assertEquals(
      await status(owner, "PUT", `/products/${ownerless}/owner`, {
        email: OWNER,
      }),
      403,
    );
    await ok(admin, "PUT", `/products/${ownerless}/owner`, { email: OWNER });
    assertEquals((await accessOf(ownerless)).owner, OWNER);

    // Folders carry no level (R5): a user who holds nothing inside deletes
    // a folder, and its product moves up.
    const doomed = await folder(null);
    const hiddenInside = await create(owner, "report", doomed);
    const freed = await ok<{ freedProductIds: string[] }>(
      stranger,
      "DELETE",
      `/folders/${doomed}`,
    );
    assertEquals(freed.freedProductIds, [hiddenInside]);

    // The bulk action: the admin only, even against a user who can edit
    // every product in the folder. It reaches a subfolder and never lowers a
    // general access or a grant.
    const top = await folder(null);
    const sub = await folder(top);
    const openInTop = await create(owner, "report", top);
    const privateInSub = await create(owner, "slide_deck", sub);
    assertEquals(
      (await setAccess(owner, openInTop, "edit", [
        { email: VIEWER, level: "edit" },
      ])).status,
      200,
    );
    assertEquals(
      (await setAccess(owner, privateInSub, "none", [
        { email: EDITOR, level: "edit" },
      ])).status,
      200,
    );
    const bulk = {
      defaultAccess: "view",
      grants: [
        { email: STRANGER, level: "view" },
        { email: VIEWER, level: "view" },
      ],
    };
    assertEquals(
      await status(editor, "PUT", `/folders/${top}/products/access`, bulk),
      403,
    );
    assertEquals(
      await status(stranger, "GET", `/products/${privateInSub}/slide-deck`),
      403,
    );
    const raised = await ok<{ productIds: string[] }>(
      admin,
      "PUT",
      `/folders/${top}/products/access`,
      bulk,
    );
    assertEquals(raised.productIds.sort(), [openInTop, privateInSub].sort());
    await ok(stranger, "GET", `/products/${privateInSub}/slide-deck`);
    assertEquals(
      await status(stranger, "PUT", `/products/${privateInSub}/label`, {
        label: "x",
      }),
      403,
    );
    assertEquals(await accessOf(privateInSub), {
      owner: OWNER,
      defaultAccess: "view",
      grants: [
        { email: EDITOR, level: "edit" },
        { email: STRANGER, level: "view" },
        { email: VIEWER, level: "view" },
      ],
    });
    assertEquals(await accessOf(openInTop), {
      owner: OWNER,
      defaultAccess: "edit",
      grants: [
        { email: STRANGER, level: "view" },
        { email: VIEWER, level: "edit" },
      ],
    });
  } finally {
    for (const socket of sockets) {
      await socket.stop();
    }
    if (productIds.length > 0) {
      await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    }
    if (folderIds.length > 0) {
      await mainDb`DELETE FROM folders WHERE id = ANY(${folderIds})`;
    }
    await mainDb`DELETE FROM users WHERE email = ANY(${USERS})`;
    await closeAllConnections();
  }
});
