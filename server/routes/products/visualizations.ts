import { Hono } from "hono";
import { figureBundleSchema } from "lib";
import {
  copyVisualizationFromVersion,
  createVisualization,
  getVisualizationDetail,
  getVisualizationVersion,
  insertVisualizationVersion,
  latestVisualizationVersionHash,
  listVisualizationVersions,
  restoreVisualizationContent,
  updateProductLabel,
  updateVisualizationBundle,
  VISUALIZATION_NOT_FOUND,
} from "../../db/products/mod.ts";
import {
  applyVisualizationToLiveRoom,
  flushVisualizationRoom,
} from "../../collab/visualization_rooms.ts";
import {
  drainVersionEditors,
  editorFromGlobalUser,
  isoStrictlyAfter,
  loadVisualizationVersionData,
  recordVersionEdit,
  visualizationContentHash,
} from "../../collab/version_capture.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceProductsUpserted,
  notifyInstanceRunsCatalogUpdated,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductVisualizations = new Hono();

// Visualization content and versions only: label, folder, package, scope,
// duplicate and delete are the shared product routes (./products.ts). The
// guard is the registry entry's `access`. Every content write is attributed
// to the visualization's version session, as a report's are.

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
    // A visualization is born with its figure, so its creation is the first
    // edit: the first version is the figure as it was made.
    recordVersionEdit(
      "visualization",
      res.data.productId,
      editorFromGlobalUser(c.var.globalUser),
    );
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
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyVisualizationToLiveRoom(
      params.product_id,
      params.product_id,
      { bundle: body.bundle },
      editor,
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
    recordVersionEdit("visualization", params.product_id, editor);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductVisualizations,
  "listVisualizationVersions",
  async (c, { params }) => {
    return respond(
      c,
      await listVisualizationVersions(c.var.mainDb, params.product_id),
    );
  },
);

defineRoute(
  routesProductVisualizations,
  "getVisualizationVersion",
  async (c, { params }) => {
    return respond(
      c,
      await getVisualizationVersion(
        c.var.mainDb,
        params.product_id,
        params.version_id,
      ),
    );
  },
);

// A restore as the report's (./reports.ts, restoreReportVersion, holds the
// reasoning for each step): validate the snapshot, flush the live room, write
// a safety version of the current state, apply the snapshot through the room
// when one is live, then record the restored state as its own version. The
// snapshot's figure keeps the pair it was resolved under; an editor's next
// open re-resolves it under the product's pair, as for a package change.
defineRoute(
  routesProductVisualizations,
  "restoreVisualizationVersion",
  log("restoreVisualizationVersion"),
  async (c, { params }) => {
    const mainDb = c.var.mainDb;
    const productId = params.product_id;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getVisualizationVersion(
      mainDb,
      productId,
      params.version_id,
    );
    if (!versionRes.success) {
      return respond(c, versionRes);
    }
    const version = versionRes.data;
    const parsed = figureBundleSchema.safeParse(version.bundle);
    if (!parsed.success) {
      return respond(c, {
        success: false as const,
        err:
          "This version's content is no longer compatible with the current app version and cannot be restored.",
      });
    }
    const bundle = parsed.data;

    if (!await flushVisualizationRoom(productId, productId)) {
      return respond(c, {
        success: false as const,
        err:
          "This visualization has unsaved live edits that could not be saved yet, so a safety version cannot be created. Please retry once saving recovers.",
      });
    }

    const drained = drainVersionEditors("visualization", productId);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit("visualization", productId, e);
      }
    };

    let current;
    try {
      current = await loadVisualizationVersionData(productId);
    } catch (error) {
      reinjectDrained();
      return respond(c, {
        success: false as const,
        err: error instanceof Error ? error.message : "Load failed",
      });
    }
    if (!current) {
      return respond(c, {
        success: false as const,
        err: VISUALIZATION_NOT_FOUND,
      });
    }
    const currentHash = visualizationContentHash(current);
    const latestRes = await latestVisualizationVersionHash(mainDb, productId);
    const safetyCreatedAt = new Date().toISOString();
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertVisualizationVersion(mainDb, {
        productId,
        createdAt: safetyCreatedAt,
        label: current.label,
        bundle: current.bundle,
        editors: drained.length > 0 ? drained : [restorer],
        contentHash: currentHash,
      });
      if (!safetyRes.success) {
        reinjectDrained();
        return respond(c, safetyRes);
      }
    }

    // No editor: the restore versions itself below.
    const roomRes = await applyVisualizationToLiveRoom(productId, productId, {
      bundle,
    });
    if (roomRes.status === "save_failed") {
      reinjectDrained();
      return respond(c, {
        success: false as const,
        err:
          "The restore was applied to the live editing session but could not be saved yet. Saving will retry automatically; please retry the restore if it does not appear.",
      });
    }
    let lastUpdated: string;
    if (roomRes.status === "saved") {
      // The label is not part of the room doc: restore it directly.
      const labelRes = await updateProductLabel(
        mainDb,
        productId,
        version.label,
      );
      if (!labelRes.success) {
        await notifyInstanceProductsUpserted(mainDb, [productId]);
        return respond(c, {
          success: false as const,
          err:
            `Restored the visualization but failed to restore its name: ${labelRes.err}`,
        });
      }
      lastUpdated = labelRes.data.lastUpdated;
    } else {
      const res = await restoreVisualizationContent(mainDb, productId, {
        label: version.label,
        bundle,
      });
      if (!res.success) {
        return respond(c, res);
      }
      lastUpdated = res.data.lastUpdated;
    }

    const restored = { label: version.label, bundle };
    const restoredRes = await insertVisualizationVersion(mainDb, {
      productId,
      createdAt: isoStrictlyAfter(safetyCreatedAt),
      ...restored,
      editors: [restorer],
      contentHash: visualizationContentHash(restored),
      restoredFromVersionId: version.id,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    await notifyInstanceProductsUpserted(mainDb, [productId]);
    return respond(c, { success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesProductVisualizations,
  "copyVisualizationVersion",
  log("copyVisualizationVersion"),
  async (c, { params, body }) => {
    const res = await copyVisualizationFromVersion(c.var.mainDb, {
      productId: params.product_id,
      versionId: params.version_id,
      label: body.label,
      folderId: body.folderId,
      createdBy: c.var.globalUser.email,
    });
    if (!res.success) {
      return respond(c, res);
    }
    recordVersionEdit(
      "visualization",
      res.data.productId,
      editorFromGlobalUser(c.var.globalUser),
    );
    await notifyInstanceProductsUpserted(c.var.mainDb, [res.data.productId]);
    // A new product on a package changes the catalogue's "in use by".
    notifyInstanceRunsCatalogUpdated();
    return respond(c, res);
  },
);
