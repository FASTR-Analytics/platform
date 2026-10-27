// A deck has ONE name, `products.label`. No deck-config write may carry a
// name, so a rename survives every config write, the Deck menu's included,
// and a duplicate and a restore-as-copy take the name their caller mints.
//
// Needs a ready pinned package on the dev instance. Run alone with:
//   BYPASS_AUTH= deno test -A --env-file server/tests/deck_label_single_source_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  getStartingConfigForSlideDeck,
} from "lib";
import { getPgConnectionFromCacheOrNew } from "../db/mod.ts";
import { getPinnedRunId } from "../db/instance/run_generation.ts";
import { closeAllConnections } from "../db/postgres/connection_manager.ts";
import {
  copySlideDeckFromVersion,
  createProduct,
  duplicateProduct,
  getSlideDeckDetail,
  insertSlideDeckVersion,
  loadSlideDeckVersionData,
  updateProductLabel,
  updateSlideDeckConfig,
} from "../db/products/mod.ts";

function data<T>(res: APIResponseWithData<T>): T {
  if (!res.success) throw new Error(res.err);
  return res.data;
}

Deno.test("the deck's name is products.label alone", async () => {
  const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");
  const runId = data(await getPinnedRunId(mainDb));
  if (runId === null) {
    throw new Error("The dev instance has no pinned package; pin one first.");
  }

  const tag = crypto.randomUUID().slice(0, 8);
  const OWNER = `deck-label-${tag}@example.com`;
  await mainDb`INSERT INTO users (email, is_admin) VALUES (${OWNER}, FALSE)`;
  const productIds: string[] = [];

  const labelOf = async (productId: string) =>
    (await mainDb<{ label: string }[]>`
      SELECT label FROM products WHERE id = ${productId}
    `)[0].label;

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

    const RENAMED = `Renamed ${tag}`;
    data(await updateProductLabel(mainDb, deck, RENAMED));
    assertEquals(await labelOf(deck), RENAMED);

    // The stored config, as the editor loads it, then a config write of the
    // shape the Deck menu makes: the whole loaded config with one field
    // changed. The name must come back unchanged.
    const loaded = data(await getSlideDeckDetail(mainDb, deck)).config;
    data(
      await updateSlideDeckConfig(mainDb, deck, {
        ...loaded,
        showPageNumbers: !loaded.showPageNumbers,
      }),
    );
    assertEquals(await labelOf(deck), RENAMED);
    assert(!("label" in loaded), "a stored deck config carries no name");

    // A starting config has no name to carry either, so even a write that
    // discards the loaded config cannot rename the deck.
    data(
      await updateSlideDeckConfig(
        mainDb,
        deck,
        getStartingConfigForSlideDeck(),
      ),
    );
    assertEquals(await labelOf(deck), RENAMED);

    // A duplicate's name is the registry row's, and nothing inside the copied
    // config contradicts it.
    const copy = data(
      await duplicateProduct(mainDb, deck, OWNER, ALL_DATA_SCOPE_ID),
    ).productId;
    productIds.push(copy);
    assert((await labelOf(copy)).startsWith(RENAMED), await labelOf(copy));
    assert(
      !("label" in data(await getSlideDeckDetail(mainDb, copy)).config),
      "a duplicated deck config carries no name",
    );

    // Restore-as-copy: the new product takes the label the caller names, and
    // the snapshot's own config cannot override it.
    const snapshot = data(await loadSlideDeckVersionData(mainDb, deck));
    const versionId = data(
      await insertSlideDeckVersion(mainDb, {
        productId: deck,
        createdAt: new Date().toISOString(),
        label: snapshot.label,
        deckConfig: snapshot.deckConfig,
        slides: snapshot.slides,
        editors: [],
        contentHash: `deck-label-${tag}`,
      }),
    ).versionId;
    const RESTORED = `Restored ${tag}`;
    const restored = data(
      await copySlideDeckFromVersion(mainDb, {
        productId: deck,
        versionId,
        label: RESTORED,
        folderId: null,
        createdBy: OWNER,
      }),
    ).productId;
    productIds.push(restored);
    assertEquals(await labelOf(restored), RESTORED);
    assert(
      !("label" in data(await getSlideDeckDetail(mainDb, restored)).config),
      "a restored deck config carries no name",
    );
  } finally {
    await mainDb`DELETE FROM products WHERE id = ANY(${productIds})`;
    await mainDb`DELETE FROM users WHERE email = ${OWNER}`;
    await closeAllConnections();
  }
});
