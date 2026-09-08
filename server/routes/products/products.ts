import { Hono } from "hono";
import { type ProductType } from "lib";
import {
  createProduct,
  deleteProducts,
  duplicateProduct,
  moveProductsToFolder,
  setProductScope,
  updateProductLabel,
} from "../../db/products/mod.ts";
import { setProductRun } from "../../db/instance/run_generation.ts";
import { closeReportRoom } from "../../collab/report_rooms.ts";
import { closeSlideRoom } from "../../collab/slide_rooms.ts";
import { drainVersionEditors } from "../../collab/version_capture.ts";
import { type VersionKind } from "../../collab/version_tracker.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceProductsDeleted,
  notifyInstanceProductsUpserted,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProducts = new Hono();

// Per-type dispatch is a Record, never a switch with a default (§3.6), so a
// third product type is a compile error here until both are filled in.
//
// The room a product owns DIRECTLY: a report is its own document, while a
// deck's documents are its slides, closed from the delete's slide pairs, so
// the deck entry is deliberately empty.
const CLOSE_PRODUCT_ROOM: Record<ProductType, (productId: string) => void> = {
  slide_deck: () => {},
  report: (productId) =>
    closeReportRoom(productId, productId, "This report was deleted"),
};

const PRODUCT_VERSION_KIND: Record<ProductType, VersionKind> = {
  slide_deck: "deck",
  report: "report",
};

// The cross-type product surface: label, folder, package, scope, duplicate
// and delete treat a deck and a report alike, so there is ONE set of routes
// (D1). The guard is the registry entry's `access`, installed by defineRoute:
// no handler here checks access (D2). Every route that changes a product
// re-reads the touched summaries through notifyInstanceProductsUpserted, the
// only product-list message, whose `lastUpdated` versions the detail cache.

defineRoute(
  routesProducts,
  "createProduct",
  log("createProduct"),
  async (c, { body }) => {
    const res = await createProduct(c.var.mainDb, {
      type: body.type,
      folderId: body.folderId,
      createdBy: c.var.globalUser.email,
    });
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [res.data.productId]);
    return respond(c, res);
  },
);

defineRoute(
  routesProducts,
  "updateProductLabel",
  log("updateProductLabel"),
  async (c, { params, body }) => {
    const res = await updateProductLabel(
      c.var.mainDb,
      params.product_id,
      body.label,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProducts,
  "moveProductsToFolder",
  log("moveProductsToFolder"),
  async (c, { body }) => {
    const res = await moveProductsToFolder(
      c.var.mainDb,
      body.productIds,
      body.folderId,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, res.data.movedIds);
    return respond(c, {
      success: true as const,
      data: { lastUpdated: res.data.lastUpdated },
    });
  },
);

defineRoute(
  routesProducts,
  "deleteProducts",
  log("deleteProducts"),
  async (c, { body }) => {
    // A live room left on a deleted row would fail its checkpoints forever,
    // and a version session left in the tracker would flush against a row
    // that is gone. The DB layer returns each deleted row's type and each
    // slide's own deck, so each room is closed once, for the document that
    // owns it.
    const res = await deleteProducts(c.var.mainDb, body.productIds);
    if (!res.success) {
      return respond(c, res);
    }
    for (const { productId, slideId } of res.data.deletedSlides) {
      closeSlideRoom(productId, slideId, "This slide deck was deleted");
    }
    const deletedIds: string[] = [];
    for (const { id, type } of res.data.deleted) {
      CLOSE_PRODUCT_ROOM[type](id);
      drainVersionEditors(PRODUCT_VERSION_KIND[type], id);
      deletedIds.push(id);
    }
    notifyInstanceProductsDeleted(deletedIds);
    // A delete frees the packages it pointed at: the catalogue's "in use by"
    // and delete guard change.
    notifyInstanceRunsCatalogUpdated();
    return respond(c, {
      success: true as const,
      data: { deletedIds },
    });
  },
);

defineRoute(
  routesProducts,
  "setProductPackage",
  log("setProductPackage"),
  async (c, { params, body }) => {
    const res = await setProductRun(c.var.mainDb, params.product_id, body.runId);
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    // A repoint changes the catalogue's "in use by" column and therefore
    // which packages are deletable, so the catalogue has to refetch.
    notifyInstanceRunsCatalogUpdated();
    return respond(c, res);
  },
);

defineRoute(
  routesProducts,
  "setProductScope",
  log("setProductScope"),
  async (c, { params, body }) => {
    const res = await setProductScope(
      c.var.mainDb,
      params.product_id,
      body.adminArea2,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProducts,
  "duplicateProduct",
  log("duplicateProduct"),
  async (c, { params }) => {
    const res = await duplicateProduct(
      c.var.mainDb,
      params.product_id,
      c.var.globalUser.email,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [res.data.productId]);
    notifyInstanceRunsCatalogUpdated();
    return respond(c, res);
  },
);
