import { Hono } from "hono";
import {
  createVisualization,
  getVisualizationDetail,
  updateVisualizationBundle,
} from "../../db/products/mod.ts";
import { applyVisualizationToLiveRoom } from "../../collab/visualization_rooms.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceProductsUpserted,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductVisualizations = new Hono();

// Visualization content only: label, folder, package, scope, duplicate and
// delete are the shared product routes (./products.ts). The guard is the
// registry entry's `access`. Not versioned, so no write records a version
// edit.

// The bundle must have been resolved under the package the product is
// created on; a mismatch is a client bug, refused before anything is stored.
const BUNDLE_PACKAGE_MISMATCH =
  "The visualization was prepared for a different results package";

defineRoute(
  routesProductVisualizations,
  "createVisualization",
  log("createVisualization"),
  async (c, { body }) => {
    if (body.bundle.provenance.runId !== body.runId) {
      return respond(c, {
        success: false as const,
        err: BUNDLE_PACKAGE_MISMATCH,
      });
    }
    const res = await createVisualization(c.var.mainDb, {
      folderId: body.folderId,
      runId: body.runId,
      scopeId: body.scopeId,
      createdBy: c.var.globalUser.email,
      label: body.label,
      bundle: body.bundle,
    });
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [res.data.productId]);
    // A new product on a package changes the catalogue's "in use by".
    notifyInstanceRunsCatalogUpdated();
    return respond(c, res);
  },
);

defineRoute(
  routesProductVisualizations,
  "getVisualizationDetail",
  async (c, { params }) => {
    return respond(
      c,
      await getVisualizationDetail(c.var.mainDb, params.product_id),
    );
  },
);

// The route answered on the live-room path. `save_failed` means the room
// applied the change (peers already see it) but could not persist it: no
// direct-write fallback, the room owns persistence.
const SAVE_FAILED_ERR =
  "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.";

defineRoute(
  routesProductVisualizations,
  "updateVisualization",
  log("updateVisualization"),
  async (c, { params, body }) => {
    const roomRes = await applyVisualizationToLiveRoom(
      params.product_id,
      params.product_id,
      { bundle: body.bundle },
    );
    if (roomRes.status === "saved") {
      return respond(c, {
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      return respond(c, { success: false as const, err: SAVE_FAILED_ERR });
    }
    const res = await updateVisualizationBundle(
      c.var.mainDb,
      params.product_id,
      body.bundle,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);
