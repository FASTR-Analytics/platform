// A `last_updated` stamp is an instruction to re-read the row it names, so a
// write that REMOVES a slide must not emit one for it: the removal rides
// products_upserted, in the deck's shrunken `slideIds`. Both removal paths are
// driven through their real routes and the hub's own BroadcastChannel is read.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel \
//     server/tests/slide_delete_no_stamp_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  type ContentSlide,
  type InstanceSseMessage,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  createProduct,
  insertSlideDeckVersion,
  loadSlideDeckVersionData,
} from "../db/products/mod.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";
import { appFor, ok } from "./_harness/route_app.ts";

const OWNER = `slide-stamp-${crypto.randomUUID().slice(0, 8)}@example.com`;

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

const textSlide = (markdown: string): ContentSlide => ({
  type: "content",
  header: "Slide",
  layout: { type: "item", id: "a1a", data: { type: "text", markdown } },
});

// Every message the hub posted while `body` ran. A BroadcastChannel never
// delivers to the object that posted, so this separate channel sees the hub's
// traffic; the hub's products_upserted is async, so drain after a turn.
async function captured(
  body: () => Promise<void>,
): Promise<InstanceSseMessage[]> {
  const seen: InstanceSseMessage[] = [];
  const channel = new BroadcastChannel("instance_updates");
  channel.onmessage = (e: MessageEvent) =>
    void seen.push(e.data as InstanceSseMessage);
  try {
    await body();
    await new Promise((r) => setTimeout(r, 200));
  } finally {
    channel.close();
  }
  return seen;
}

function stampedSlideIds(messages: InstanceSseMessage[]): string[] {
  return messages.flatMap((m) =>
    m.type === "last_updated" && m.data.tableName === "slides" ? m.data.ids : []
  );
}

function upsertedProductIds(messages: InstanceSseMessage[]): string[] {
  return messages.flatMap((m) =>
    m.type === "products_upserted" ? m.data.products.map((p) => p.id) : []
  );
}

Deno.test("removing a slide stamps nothing for it", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${OWNER}, FALSE)`;

  // Everything downstream of the session, the access guard included, is the
  // real code; the guard tiers are products_routes_test.ts's subject.
  const app = appFor(OWNER, routesProductSlideDecks, routesProductSlides);

  const productIds: string[] = [];
  try {
    const deck = data(
      await createProduct(mainDb, {
        type: "slide_deck",
        folderId: null,
        runId,
        scopeId: ALL_DATA_SCOPE_ID,
        createdBy: OWNER,
      }),
    ).productId;
    productIds.push(deck);

    const keep = (await ok<{ slideId: string }>(
      app,
      "POST",
      `/products/${deck}/slides`,
      { position: { toEnd: true }, slide: textSlide("Keep me") },
    )).slideId;
    const doomed = (await ok<{ slideId: string }>(
      app,
      "POST",
      `/products/${deck}/slides`,
      { position: { toEnd: true }, slide: textSlide("Delete me") },
    )).slideId;

    // 1. The DELETE route.
    const onDelete = await captured(async () => {
      const res = await ok<{ deletedIds: string[] }>(
        app,
        "DELETE",
        `/products/${deck}/slides`,
        { slideIds: [doomed] },
      );
      assertEquals(res.deletedIds, [doomed]);
    });
    assertEquals(stampedSlideIds(onDelete), []);
    assertEquals(upsertedProductIds(onDelete), [deck]);

    // 2. The restore route, over a snapshot taken before a slide the deck
    // still holds, so the restore's plan removes it.
    const snapshot = data(await loadSlideDeckVersionData(mainDb, deck));
    const versionId = data(
      await insertSlideDeckVersion(mainDb, {
        productId: deck,
        createdAt: new Date().toISOString(),
        label: snapshot.label,
        deckConfig: snapshot.deckConfig,
        slides: snapshot.slides,
        editors: [],
        contentHash: `slide-stamp-${deck}`,
      }),
    ).versionId;
    const extra = (await ok<{ slideId: string }>(
      app,
      "POST",
      `/products/${deck}/slides`,
      { position: { toEnd: true }, slide: textSlide("Added after the save") },
    )).slideId;

    const onRestore = await captured(async () => {
      await ok(
        app,
        "POST",
        `/products/${deck}/slide-deck/versions/${versionId}/restore`,
      );
    });
    const stamped = stampedSlideIds(onRestore);
    assert(
      !stamped.includes(extra),
      `the restore stamped the slide it removed: ${stamped}`,
    );
    assertEquals(stamped, [keep], "the restore stamps only the slide it kept");
    assertEquals(upsertedProductIds(onRestore), [deck]);
    const remaining = (await mainDb<{ id: string }[]>`
      SELECT id FROM slides WHERE slide_deck_id = ${deck}
    `).map((r) => r.id);
    assertEquals(remaining, [keep], "the restore did remove the extra slide");
  } finally {
    await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    await mainDb`DELETE FROM users WHERE email = ${OWNER}`;
    await closeAllConnections();
  }
});
