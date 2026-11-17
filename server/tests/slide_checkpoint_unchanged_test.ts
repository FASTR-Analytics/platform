// A slide checkpoint whose config equals the stored one writes only the Yjs
// state: no stamp, no product touch, no notice. Without that, a room that
// re-seeds a slide reported its first checkpoint as an edit, long after the
// write that caused it. A deck restore through such a room still broadcasts
// a stamp no older than its own structure write.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file --unstable-broadcast-channel \
//     server/tests/slide_checkpoint_unchanged_test.ts

import { assert, assertEquals } from "@std/assert";
import * as Y from "yjs";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  bytesToBase64,
  type CollabServerMessage,
  type ContentSlide,
  type InstanceSseMessage,
  materializeSlide,
  seedSlideDoc,
  type Slide,
} from "lib";
import type { Sql } from "postgres";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  createProduct,
  insertSlideDeckVersion,
  loadSlideDeckVersionData,
} from "../db/products/mod.ts";
import {
  getSlide,
  getSlideCrdtState,
  saveSlideCheckpoint,
} from "../db/products/slides.ts";
import type { RoomConn } from "../collab/doc_rooms.ts";
import { subscribeSlide, unsubscribeSlide } from "../collab/slide_rooms.ts";
import { depsForSlide } from "../routes/instance/collab.ts";
import { routesProductSlideDecks } from "../routes/products/slide_decks.ts";
import { routesProductSlides } from "../routes/products/slides.ts";
import { appFor, captured, ok } from "./_harness/route_app.ts";

const OWNER = `slide-checkpoint-${crypto.randomUUID().slice(0, 8)}@example.com`;

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

const textSlide = (markdown: string): ContentSlide => ({
  type: "content",
  header: "Slide",
  layout: { type: "item", id: "a1a", data: { type: "text", markdown } },
});

type Stamps = {
  slide: string;
  crdt: string | null;
  product: string;
};

async function stampsOf(
  mainDb: Sql,
  deck: string,
  slideId: string,
): Promise<Stamps> {
  const [row] = await mainDb<
    { last_updated: string; crdt_state_last_updated: string | null }[]
  >`
    SELECT last_updated, crdt_state_last_updated FROM slides WHERE id = ${slideId}
  `;
  const [product] = await mainDb<{ last_updated: string }[]>`
    SELECT last_updated FROM products WHERE id = ${deck}
  `;
  return {
    slide: row.last_updated,
    crdt: row.crdt_state_last_updated,
    product: product.last_updated,
  };
}

function stampedSlides(messages: InstanceSseMessage[]) {
  return messages.flatMap((m) =>
    m.type === "last_updated" && m.data.tableName === "slides" ? [m.data] : []
  );
}

const crdtStateOf = (slide: Slide): string => {
  const doc = new Y.Doc();
  seedSlideDoc(doc, slide);
  return bytesToBase64(Y.encodeStateAsUpdate(doc));
};

function conn(inbox: CollabServerMessage[]): RoomConn {
  return {
    connectionId: `c-${crypto.randomUUID()}`,
    canEdit: () => true,
    identity: { email: OWNER, name: "test" },
    send: (m) => inbox.push(m),
    isLive: () => true,
  };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.test("an unchanged slide checkpoint writes only the Yjs state", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${OWNER}, FALSE)`;
  const app = appFor(OWNER, routesProductSlideDecks, routesProductSlides);

  const productIds: string[] = [];
  try {
    const deck = data(
      await createProduct(mainDb, {
        type: "slide_deck",
        label: "Test product",
        folderId: null,
        runId,
        scopeId: ALL_DATA_SCOPE_ID,
        createdBy: OWNER,
      }),
    ).productId;
    productIds.push(deck);
    const slideId = (await ok<{ slideId: string }>(
      app,
      "POST",
      `/products/${deck}/slides`,
      { position: { toEnd: true }, slide: textSlide("First") },
    )).slideId;

    // 1. A changed config stamps; the same config saved again does not, and
    // its CRDT state is current, so the next open restores rather than
    // re-seeds.
    const changed = textSlide("Changed");
    const first = data(
      await saveSlideCheckpoint(
        mainDb,
        deck,
        slideId,
        changed,
        crdtStateOf(changed),
        true,
      ),
    );
    assert(first.contentChanged);
    const afterFirst = await stampsOf(mainDb, deck, slideId);
    assertEquals(afterFirst.slide, first.lastUpdated);
    await settle(5);
    const second = data(
      await saveSlideCheckpoint(
        mainDb,
        deck,
        slideId,
        changed,
        crdtStateOf(changed),
        true,
      ),
    );
    assertEquals(second, {
      lastUpdated: afterFirst.slide,
      contentChanged: false,
    });
    const afterSecond = await stampsOf(mainDb, deck, slideId);
    assertEquals(afterSecond, {
      slide: afterFirst.slide,
      crdt: afterFirst.slide,
      product: afterFirst.product,
    });
    assert(
      data(await getSlideCrdtState(mainDb, deck, slideId)).state !== null,
      "the unchanged save left the CRDT state current",
    );

    // 2. An untrusted unchanged save stamps the CRDT state NULL.
    const untrusted = data(
      await saveSlideCheckpoint(
        mainDb,
        deck,
        slideId,
        changed,
        crdtStateOf(changed),
        false,
      ),
    );
    assertEquals(untrusted.contentChanged, false);
    assertEquals((await stampsOf(mainDb, deck, slideId)).crdt, null);

    // 3. The stored slide seeded into a doc and saved through the slide
    // room's own save closure is unchanged and notifies nothing.
    const stored = data(await getSlide(mainDb, deck, slideId)).slide;
    const doc = new Y.Doc();
    seedSlideDoc(doc, stored);
    const beforeSeeded = await stampsOf(mainDb, deck, slideId);
    const onSeededSave = await captured(async () => {
      assertEquals(
        await depsForSlide(deck, slideId).saveSlide(
          materializeSlide(doc),
          bytesToBase64(Y.encodeStateAsUpdate(doc)),
        ),
        { ok: true, lastUpdated: beforeSeeded.slide },
      );
    });
    assertEquals(onSeededSave, []);

    // 4. A restore whose surviving slide a live room already holds: the
    // room's checkpoint is unchanged and reports the slide's older stamp,
    // which must not become the restore's broadcast.
    const snapshot = data(await loadSlideDeckVersionData(mainDb, deck));
    const versionId = data(
      await insertSlideDeckVersion(mainDb, {
        productId: deck,
        createdAt: new Date().toISOString(),
        label: snapshot.label,
        deckConfig: snapshot.deckConfig,
        slides: snapshot.slides,
        editors: [],
        contentHash: `slide-checkpoint-${deck}`,
      }),
    ).versionId;
    const inbox: CollabServerMessage[] = [];
    const member = conn(inbox);
    await subscribeSlide(
      deck,
      slideId,
      member,
      "",
      depsForSlide(deck, slideId),
    );
    try {
      const beforeRestore = await stampsOf(mainDb, deck, slideId);
      const onRestore = await captured(async () => {
        await ok(
          app,
          "POST",
          `/products/${deck}/slide-deck/versions/${versionId}/restore`,
        );
      });
      const afterRestore = await stampsOf(mainDb, deck, slideId);
      assertEquals(
        afterRestore.slide,
        beforeRestore.slide,
        "the room's checkpoint of the unchanged slide stamped nothing",
      );
      const notices = stampedSlides(onRestore);
      assertEquals(notices.map((n) => n.ids), [[slideId]]);
      assert(
        notices[0].lastUpdated >= afterRestore.product,
        `the restore broadcast ${
          notices[0].lastUpdated
        }, older than its structure write ${afterRestore.product}`,
      );
    } finally {
      unsubscribeSlide(deck, slideId, member);
      await settle(300);
    }
  } finally {
    await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    await mainDb`DELETE FROM users WHERE email = ${OWNER}`;
    await closeAllConnections();
  }
});
