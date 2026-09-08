import { Hono } from "hono";
import { type Slide } from "lib";
import {
  copySlidesToSlideDeck,
  createSlide,
  deleteSlides,
  duplicateSlides,
  getSlide,
  getSlides,
  moveSlides,
  updateSlide,
} from "../../db/products/mod.ts";
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
import {
  notifyInstanceLastUpdated,
  notifyInstanceProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductSlides = new Hono();

// Slides are a deck's content, so every write here notifies twice: the slide
// rows carry their own `last_updated` version, and the deck is a product, so
// its summary rides products_upserted. Every read and write is scoped by the
// product in the path, so a slide id from another deck is a 404. Every
// write is attributed to the deck's version session and the per-slide ledger
// (S16), and the plain update goes through the live room when one exists.

defineRoute(
  routesProductSlides,
  "getSlides",
  async (c, { params }) => {
    return respond(c, await getSlides(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductSlides,
  "getSlide",
  async (c, { params }) => {
    return respond(
      c,
      await getSlide(c.var.mainDb, params.product_id, params.slide_id),
    );
  },
);

defineRoute(
  routesProductSlides,
  "createSlide",
  log("createSlide"),
  async (c, { params, body }) => {
    const res = await createSlide(
      c.var.mainDb,
      params.product_id,
      body.position,
      body.slide as Slide,
    );
    if (!res.success) {
      return respond(c, res);
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.product_id, editor);
    recordSlideAdded(params.product_id, res.data.slideId, editor.email);
    notifyInstanceLastUpdated("slides", [res.data.slideId], res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

// Registered before updateSlide: `PUT .../slides/move` also matches
// `PUT .../slides/:slide_id`, and Hono runs matching handlers in registration
// order, so the literal segment must be defined first or the update route's
// body schema answers every move with a 400.
defineRoute(
  routesProductSlides,
  "moveSlides",
  log("moveSlides"),
  async (c, { params, body }) => {
    const res = await moveSlides(
      c.var.mainDb,
      params.product_id,
      body.slideIds,
      body.position,
    );
    if (!res.success) {
      return respond(c, res);
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.product_id, editor);
    recordDeckReordered(params.product_id, editor.email);
    notifyInstanceLastUpdated("slides", body.slideIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "updateSlide",
  async (c, { params, body }) => {
    // While a collab room is live for this slide, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead: the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately, firing its own notifications.
    // The expectedLastUpdated conflict check does not apply on this path:
    // merging into the live doc IS the conflict resolution.
    // The route body schema validated this before the handler ran, which
    // matters here: Yjs transactions don't roll back, so malformed content
    // would partially mutate the shared doc and poison every later
    // checkpoint's schema parse. The cast bridges the branded-LayoutNode gap
    // only (see the schema note in lib/api-routes).
    const slide = body.slide as Slide;
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applySlideToLiveRoom(
      params.product_id,
      params.slide_id,
      slide,
      editor,
    );
    if (roomRes.status === "saved") {
      return respond(c, {
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      // The room applied the change (peers already see it) but could not
      // persist it. No direct-write fallback: the room owns persistence.
      return respond(c, {
        success: false as const,
        err: "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.",
      });
    }
    const res = await updateSlide(
      c.var.mainDb,
      params.product_id,
      params.slide_id,
      slide,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return respond(c, res);
    }
    recordVersionEdit("deck", params.product_id, editor);
    recordSlideEdited(params.product_id, params.slide_id, editor.email);
    notifyInstanceLastUpdated("slides", [params.slide_id], res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "deleteSlides",
  log("deleteSlides"),
  async (c, { params, body }) => {
    const res = await deleteSlides(
      c.var.mainDb,
      params.product_id,
      body.slideIds,
    );
    if (!res.success) {
      return respond(c, res);
    }
    // ACTUALLY-deleted ids only (the delete is deck-scoped; a requested id
    // that belongs to another deck was a no-op): closing by requested id
    // would discard another deck's live room and its authorship ledgers, and
    // record a "removed by" against a slide that still exists.
    const deletedIds = res.data.deletedIds;
    // A live room left on a deleted slide would fail its checkpoints forever
    // (and clobber any future row re-created with the same id): discard.
    for (const slideId of deletedIds) {
      closeSlideRoom(params.product_id, slideId, "This slide was deleted");
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    if (deletedIds.length > 0) {
      recordVersionEdit("deck", params.product_id, editor);
    }
    for (const slideId of deletedIds) {
      recordSlideRemoved(params.product_id, slideId, editor.email);
    }
    notifyInstanceLastUpdated("slides", deletedIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "duplicateSlides",
  log("duplicateSlides"),
  async (c, { params, body }) => {
    const res = await duplicateSlides(
      c.var.mainDb,
      params.product_id,
      body.slideIds,
    );
    if (!res.success) {
      return respond(c, res);
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.product_id, editor);
    for (const slideId of res.data.newSlideIds) {
      recordSlideAdded(params.product_id, slideId, editor.email);
    }
    notifyInstanceLastUpdated("slides", res.data.newSlideIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "copySlidesToSlideDeck",
  log("copySlidesToSlideDeck"),
  async (c, { params, body }) => {
    // The copies land in the TARGET deck, which is what every notification
    // and ledger entry below names; the source in the path scopes the ids
    // being copied.
    const res = await copySlidesToSlideDeck(c.var.mainDb, {
      sourceProductId: params.product_id,
      slideIds: body.slideIds,
      targetProductId: body.targetProductId,
    });
    if (!res.success) {
      return respond(c, res);
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", body.targetProductId, editor);
    for (const slideId of res.data.newSlideIds) {
      recordSlideAdded(body.targetProductId, slideId, editor.email);
    }
    notifyInstanceLastUpdated("slides", res.data.newSlideIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [body.targetProductId]);
    return respond(c, res);
  },
);
