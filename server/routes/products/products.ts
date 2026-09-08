import { Hono } from "hono";
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
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceProductsDeleted,
  notifyInstanceProductsUpserted,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProducts = new Hono();

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
    // The batch is mixed-type; the DB layer pre-reads the slide ids of any
    // deck in it so the rooms can be closed afterwards. Slide rooms are keyed
    // by their deck, and every deleted product is offered a report room close
    // too: closing a room that does not exist is a no-op, and the batch's
    // types are not worth a second read. A live room left on a deleted row
    // would fail its checkpoints forever, and a version session left in the
    // tracker would flush against a row that is gone.
    const res = await deleteProducts(c.var.mainDb, body.productIds);
    if (!res.success) {
      return respond(c, res);
    }
    for (const productId of res.data.deletedIds) {
      for (const slideId of res.data.deletedSlideIds) {
        closeSlideRoom(productId, slideId, "This slide deck was deleted");
      }
      closeReportRoom(productId, productId, "This report was deleted");
      drainVersionEditors("deck", productId);
      drainVersionEditors("report", productId);
    }
    notifyInstanceProductsDeleted(res.data.deletedIds);
    // A delete frees the packages it pointed at: the catalogue's "in use by"
    // and delete guard change.
    notifyInstanceRunsCatalogUpdated();
    return respond(c, {
      success: true as const,
      data: { deletedIds: res.data.deletedIds },
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
