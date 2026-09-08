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
    // The slide ids come back for 7a, which closes the slide and report
    // rooms and drops the version accumulators before they become zombies;
    // rooms are project-keyed until then.
    const res = await deleteProducts(c.var.mainDb, body.productIds);
    if (!res.success) {
      return respond(c, res);
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
