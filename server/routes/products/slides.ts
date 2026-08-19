import { Hono } from "hono";
import {
  copySlidesToDeck,
  createSlide,
  deleteSlides,
  duplicateSlides,
  getSlide,
  getSlides,
  moveSlides,
  updateSlide,
} from "../../db/mod.ts";
import { type Slide } from "lib";
import {
  applySlideToLiveRoom,
  closeSlideRoom,
} from "../../collab/slide_rooms.ts";
import {
  editorFromGlobalUser,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import {
  recordDeckReordered,
  recordSlideAdded,
  recordSlideEdited,
  recordSlideRemoved,
} from "../../collab/deck_session_ledger.ts";
import { log } from "../../middleware/logging.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import {
  notifyLastUpdated,
  notifyProductsUpserted,
} from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlides = new Hono();

// Slides are a deck's content, so every write here notifies twice: the slide
// rows carry their own `last_updated` version (the ONLY table that still
// does), and the deck is a product, so its summary rides products_upserted.

// Get all slides
defineRoute(
  routesSlides,
  "getSlides",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getSlides(c.var.mainDb, params.deck_id);
    return c.json(res);
  },
);

// Get single slide
defineRoute(
  routesSlides,
  "getSlide",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getSlide(c.var.mainDb, params.slide_id);
    return c.json(res);
  },
);

// Create slide
defineRoute(
  routesSlides,
  "createSlide",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await createSlide(
      c.var.mainDb,
      params.deck_id,
      body.position,
      body.slide as Slide,
    );
    if (!res.success) {
      return c.json(res);
    }

    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.deck_id, editor);
    recordSlideAdded(params.deck_id, res.data.slideId, editor.email);

    notifyLastUpdated("slides", [res.data.slideId], res.data.lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json(res);
  },
);

// Update slide (replace entirely)
defineRoute(
  routesSlides,
  "updateSlide",
  requireApprovedUser(),
  async (c, { params, body }) => {
    // While a collab room is live for this slide, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead — the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately. The expectedLastUpdated
    // conflict check doesn't apply on this path: merging into the live doc IS
    // the conflict resolution. (The room's checkpoint fires its own SSE
    // notifications, products_upserted included.)
    // The route body schema validated this before the handler ran, which
    // matters here: Yjs transactions don't roll back, so malformed content
    // would partially mutate the shared doc (vandalizing co-editors' view) and
    // poison every subsequent checkpoint's schema parse. The cast bridges the
    // branded-LayoutNode gap only (see the schema note in lib/api-routes).
    const slide = body.slide as Slide;
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applySlideToLiveRoom(params.slide_id, slide, editor);
    if (roomRes.status === "saved") {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      // The room applied the change (peers already see it) but could not
      // persist it. No direct-write fallback — the room owns persistence.
      return c.json({
        success: false as const,
        err: "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.",
      });
    }

    const res = await updateSlide(
      c.var.mainDb,
      params.slide_id,
      slide,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit("deck", res.data.deckId, editor);
    recordSlideEdited(res.data.deckId, params.slide_id, editor.email);

    notifyLastUpdated("slides", [params.slide_id], res.data.lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [res.data.deckId]);

    // `deckId` was only needed to attribute and broadcast — the caller opened
    // the deck to get here.
    return c.json({
      success: true as const,
      data: { lastUpdated: res.data.lastUpdated },
    });
  },
);

// Delete slides
defineRoute(
  routesSlides,
  "deleteSlides",
  requireApprovedUser(),
  log("deleteSlides"),
  async (c, { params, body }) => {
    const lastUpdated = new Date().toISOString();

    const res = await deleteSlides(c.var.mainDb, params.deck_id, body.slideIds);
    if (!res.success) {
      return c.json(res);
    }

    // ACTUALLY-deleted ids only (the delete is deck-scoped; a requested id
    // that now belongs to another deck was a no-op): closing by requested id
    // would discard another deck's live room and its authorship ledgers, and
    // record a "removed by" against a slide that still exists.
    const deletedIds = res.data.deletedIds;

    // A live room left on a deleted slide would fail its checkpoints forever
    // (and clobber any future row re-created with the same id) — discard.
    for (const slideId of deletedIds) {
      closeSlideRoom(slideId, "This slide was deleted");
    }

    const deleteEditor = editorFromGlobalUser(c.var.globalUser);
    if (deletedIds.length > 0) {
      recordVersionEdit("deck", params.deck_id, deleteEditor);
    }
    for (const slideId of deletedIds) {
      recordSlideRemoved(params.deck_id, slideId, deleteEditor.email);
    }

    notifyLastUpdated("slides", deletedIds, lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json({
      success: true as const,
      data: { ...res.data, lastUpdated },
    });
  },
);

// Duplicate slides
defineRoute(
  routesSlides,
  "duplicateSlides",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await duplicateSlides(
      c.var.mainDb,
      params.deck_id,
      body.slideIds,
    );
    if (!res.success) {
      return c.json(res);
    }

    const duplicateEditor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.deck_id, duplicateEditor);
    for (const slideId of res.data.newSlideIds) {
      recordSlideAdded(params.deck_id, slideId, duplicateEditor.email);
    }

    notifyLastUpdated("slides", res.data.newSlideIds, res.data.lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json(res);
  },
);

// Move slides
defineRoute(
  routesSlides,
  "moveSlides",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await moveSlides(
      c.var.mainDb,
      params.deck_id,
      body.slideIds,
      body.position,
    );
    if (!res.success) {
      return c.json(res);
    }

    const moveEditor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.deck_id, moveEditor);
    recordDeckReordered(params.deck_id, moveEditor.email);

    notifyLastUpdated("slides", body.slideIds, res.data.lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json(res);
  },
);

// Copy slides into another deck
defineRoute(
  routesSlides,
  "copySlidesToDeck",
  requireApprovedUser(),
  log("copySlidesToDeck"),
  async (c, { body }) => {
    // The cross-deck reuse path — there is no figure library (D3). Slide ids
    // are unique instance-wide, so the source deck in the path is addressing
    // only; the copies land in the TARGET deck, which is what every write and
    // notification below names. Bundles are copied verbatim, so a copied
    // figure shows stale under the target when the two products' (package,
    // scope) pairs differ (D4).
    const res = await copySlidesToDeck(c.var.mainDb, {
      slideIds: body.slideIds,
      targetDeckId: body.targetDeckId,
    });
    if (!res.success) {
      return c.json(res);
    }

    const copyEditor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", body.targetDeckId, copyEditor);
    for (const slideId of res.data.newSlideIds) {
      recordSlideAdded(body.targetDeckId, slideId, copyEditor.email);
    }

    notifyLastUpdated("slides", res.data.newSlideIds, res.data.lastUpdated);
    await notifyProductsUpserted(c.var.mainDb, [body.targetDeckId]);

    return c.json(res);
  },
);
