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
// product in the path, so a slide id from another deck is a 404. The
// live-room chokepoint and the version ledgers arrive with collab in 7a.

defineRoute(
  routesProductSlides,
  "getProductSlides",
  async (c, { params }) => {
    return respond(c, await getSlides(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductSlides,
  "getProductSlide",
  async (c, { params }) => {
    return respond(
      c,
      await getSlide(c.var.mainDb, params.product_id, params.slide_id),
    );
  },
);

defineRoute(
  routesProductSlides,
  "createProductSlide",
  log("createProductSlide"),
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
    notifyInstanceLastUpdated("slides", [res.data.slideId], res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

// Registered before updateProductSlide: `PUT .../slides/move` also matches
// `PUT .../slides/:slide_id`, and Hono runs matching handlers in registration
// order, so the literal segment must be defined first or the update route's
// body schema answers every move with a 400.
defineRoute(
  routesProductSlides,
  "moveProductSlides",
  log("moveProductSlides"),
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
    notifyInstanceLastUpdated("slides", body.slideIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "updateProductSlide",
  async (c, { params, body }) => {
    // The route body schema validated the slide before the handler ran; the
    // cast bridges the branded-LayoutNode gap only (see the registry note).
    const res = await updateSlide(
      c.var.mainDb,
      params.product_id,
      params.slide_id,
      body.slide as Slide,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return respond(c, res);
    }
    notifyInstanceLastUpdated("slides", [params.slide_id], res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "deleteProductSlides",
  log("deleteProductSlides"),
  async (c, { params, body }) => {
    const res = await deleteSlides(
      c.var.mainDb,
      params.product_id,
      body.slideIds,
    );
    if (!res.success) {
      return respond(c, res);
    }
    notifyInstanceLastUpdated("slides", res.data.deletedIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlides,
  "duplicateProductSlides",
  log("duplicateProductSlides"),
  async (c, { params, body }) => {
    const res = await duplicateSlides(
      c.var.mainDb,
      params.product_id,
      body.slideIds,
    );
    if (!res.success) {
      return respond(c, res);
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
    // below names; the source in the path scopes the ids being copied.
    const res = await copySlidesToSlideDeck(c.var.mainDb, {
      sourceProductId: params.product_id,
      slideIds: body.slideIds,
      targetProductId: body.targetProductId,
    });
    if (!res.success) {
      return respond(c, res);
    }
    notifyInstanceLastUpdated("slides", res.data.newSlideIds, res.data.lastUpdated);
    await notifyInstanceProductsUpserted(c.var.mainDb, [body.targetProductId]);
    return respond(c, res);
  },
);
