import { Hono } from "hono";
import { reportFiguresSchema, reportImagesSchema, stripTombstoneRuns } from "lib";
import {
  copyReportFromVersion,
  getReportDetail,
  getReportVersion,
  getReportVersionLineage,
  insertReportVersion,
  latestReportVersionHash,
  listReportVersions,
  restoreReportContent,
  updateProductLabel,
  updateReportBody,
  updateReportConfig,
  updateReportFigures,
  updateReportImages,
} from "../../db/products/mod.ts";
import { compactTombstones } from "../../collab/authorship.ts";
import {
  applyReportToLiveRoom,
  flushReportRoom,
} from "../../collab/report_rooms.ts";
import {
  drainVersionEditors,
  editorFromGlobalUser,
  isoStrictlyAfter,
  loadReportVersionData,
  recordVersionEdit,
  reportContentHash,
} from "../../collab/version_capture.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceProductsUpserted } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductReports = new Hono();

// Report content and versions only: label, folder, package, scope,
// duplicate and delete are the shared product routes (./products.ts). The
// guard is the registry entry's `access`. The three content writes go
// through the live room when one exists, and every write is attributed to
// the report's version session (S16).

defineRoute(
  routesProductReports,
  "getReportDetail",
  async (c, { params }) => {
    return respond(c, await getReportDetail(c.var.mainDb, params.product_id));
  },
);

// The route answered on the live-room path. `save_failed` means the room
// applied the change (peers already see it) but could not persist it: no
// direct-write fallback, the room owns persistence.
const SAVE_FAILED_ERR =
  "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.";

defineRoute(
  routesProductReports,
  "updateReportBody",
  async (c, { params, body }) => {
    // While a collab room is live for this report, the room's doc is
    // authoritative: route the save through it so the change merges into the
    // shared doc and the room checkpoints it (firing its own notification).
    // Merging into the live doc IS the conflict resolution, so the room path
    // reports conflicted: false.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.product_id,
      params.product_id,
      { body: body.body },
      editor,
    );
    if (roomRes.status === "saved") {
      return respond(c, {
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated, conflicted: false },
      });
    }
    if (roomRes.status === "save_failed") {
      return respond(c, { success: false as const, err: SAVE_FAILED_ERR });
    }
    const res = await updateReportBody(
      c.var.mainDb,
      params.product_id,
      body.body,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return respond(c, res);
    }
    recordVersionEdit("report", params.product_id, editor);
    // The summary's hasEmbeds derives from the body, so the re-broadcast
    // keeps the product list fresh as well as the cache.
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductReports,
  "updateReportFigures",
  async (c, { params, body }) => {
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.product_id,
      params.product_id,
      { figures: body.figures },
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
    const res = await updateReportFigures(
      c.var.mainDb,
      params.product_id,
      body.figures,
    );
    if (!res.success) {
      return respond(c, res);
    }
    recordVersionEdit("report", params.product_id, editor);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductReports,
  "updateReportImages",
  async (c, { params, body }) => {
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.product_id,
      params.product_id,
      { images: body.images },
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
    const res = await updateReportImages(
      c.var.mainDb,
      params.product_id,
      body.images,
    );
    if (!res.success) {
      return respond(c, res);
    }
    recordVersionEdit("report", params.product_id, editor);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductReports,
  "updateReportConfig",
  log("updateReportConfig"),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.mainDb,
      params.product_id,
      body.config,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductReports,
  "listReportVersions",
  async (c, { params }) => {
    return respond(c, await listReportVersions(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductReports,
  "getReportVersion",
  async (c, { params }) => {
    return respond(
      c,
      await getReportVersion(c.var.mainDb, params.product_id, params.version_id),
    );
  },
);

defineRoute(
  routesProductReports,
  "getReportVersionLineage",
  async (c, { params }) => {
    return respond(
      c,
      await getReportVersionLineage(
        c.var.mainDb,
        params.product_id,
        params.version_id,
      ),
    );
  },
);

defineRoute(
  routesProductReports,
  "restoreReportVersion",
  log("restoreReportVersion"),
  async (c, { params }) => {
    const mainDb = c.var.mainDb;
    const productId = params.product_id;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getReportVersion(
      mainDb,
      productId,
      params.version_id,
    );
    if (!versionRes.success) {
      return respond(c, versionRes);
    }
    const version = versionRes.data;

    // Validate the snapshot against the CURRENT schemas before touching
    // anything: snapshots are stored verbatim and are not swept by migration
    // transforms. Applying unvalidated content to a live room would poison
    // it: every checkpoint's schema parse would fail forever.
    let figures: typeof version.figures;
    let images: typeof version.images;
    try {
      figures = reportFiguresSchema.parse(version.figures);
      images = reportImagesSchema.parse(version.images);
    } catch {
      return respond(c, {
        success: false as const,
        err:
          "This version's content is no longer compatible with the current app version and cannot be restored.",
      });
    }

    // Persist any un-checkpointed live-room edits FIRST: the safety snapshot
    // below reads the DB, and a live room can be up to 1.5s ahead of it. A
    // FAILED flush means the row is stale, so the "safety" version would not
    // contain the current state: abort rather than overwrite the document
    // while promising a rollback point we do not have.
    if (!await flushReportRoom(productId, productId)) {
      return respond(c, {
        success: false as const,
        err:
          "This report has unsaved live edits that could not be saved yet, so a safety version cannot be created. Please retry once saving recovers.",
      });
    }

    // Absorb the open editing session's attribution into the safety version;
    // left in the tracker it would hash-dedup against the restored state
    // later and those editors would never appear in any version.
    const drained = drainVersionEditors("report", productId);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit("report", productId, e);
      }
    };

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it is already the newest stored version).
    let current;
    try {
      current = await loadReportVersionData(productId);
    } catch (error) {
      reinjectDrained();
      return respond(c, {
        success: false as const,
        err: error instanceof Error ? error.message : "Load failed",
      });
    }
    if (!current) {
      return respond(c, { success: false as const, err: "Report not found" });
    }
    const currentHash = reportContentHash(current);
    const latestRes = await latestReportVersionHash(mainDb, productId);
    const safetyCreatedAt = new Date().toISOString();
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertReportVersion(mainDb, {
        productId,
        createdAt: safetyCreatedAt,
        label: current.label,
        body: current.body,
        figures: current.figures,
        images: current.images,
        editors: drained.length > 0 ? drained : [restorer],
        contentHash: currentHash,
        bodyAuthors: current.bodyAuthors,
      });
      if (!safetyRes.success) {
        reinjectDrained();
        return respond(c, safetyRes);
      }
    }

    // Apply the snapshot through a live room when one exists, so co-editors
    // follow the restore live. No editor param: the restore versions itself
    // below instead of going through the session tracker.
    const roomRes = await applyReportToLiveRoom(productId, productId, {
      body: version.body,
      figures,
      images,
    });
    if (roomRes.status === "save_failed") {
      // The room absorbed the snapshot but could not persist it: the restore
      // is PARTIAL (co-editors see it; the DB does not). No direct-write
      // fallback (the room owns persistence), and no restored-state version
      // below that would misrepresent the DB. The safety version exists;
      // retrying is safe.
      reinjectDrained();
      return respond(c, {
        success: false as const,
        err:
          "The restore was applied to the live editing session but could not be saved yet. Saving will retry automatically; please retry the restore if it does not appear.",
      });
    }
    let lastUpdated: string;
    if (roomRes.status === "saved") {
      lastUpdated = roomRes.lastUpdated;
      // The label is not part of the room doc: restore it directly. A failed
      // label write means the restore is PARTIAL: report it as a failure (the
      // safety version exists; retrying is safe) and record no restored-state
      // version that would misrepresent the DB.
      const labelRes = await updateProductLabel(mainDb, productId, version.label);
      if (!labelRes.success) {
        await notifyInstanceProductsUpserted(mainDb, [productId]);
        return respond(c, {
          success: false as const,
          err:
            `Restored the content but failed to restore the report name: ${labelRes.err}`,
        });
      }
      lastUpdated = labelRes.data.lastUpdated;
    } else {
      const res = await restoreReportContent(mainDb, productId, {
        label: version.label,
        body: version.body,
        figures,
        images,
      });
      if (!res.success) {
        return respond(c, res);
      }
      lastUpdated = res.data.lastUpdated;
    }

    // The restore itself appears in history, hashed through
    // reportContentHash (the one definition of the report hash field set),
    // so it matches what a later capture computes from the DB. Content is
    // restored at this point, so a failed history insert must not fail the
    // request. The restored text keeps the authorship it had in the source
    // version, LIVE runs only: the source's tombstones describe deletions in
    // that old session and would misattribute what THIS restore removed.
    const restoredRes = await insertReportVersion(mainDb, {
      productId,
      createdAt: isoStrictlyAfter(safetyCreatedAt),
      label: version.label,
      body: version.body,
      figures,
      images,
      editors: [restorer],
      contentHash: reportContentHash({
        label: version.label,
        body: version.body,
        figures,
        images,
        bodyAuthors: version.bodyAuthors,
      }),
      restoredFromVersionId: version.id,
      bodyAuthors: version.bodyAuthors
        ? stripTombstoneRuns(version.bodyAuthors)
        : null,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    // A room-path restore floods the live ledger with unknown-deleter
    // tombstones from the body rewrite: they must not leak into the next
    // session's version.
    compactTombstones(productId);

    await notifyInstanceProductsUpserted(mainDb, [productId]);
    return respond(c, { success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesProductReports,
  "copyReportVersion",
  log("copyReportVersion"),
  async (c, { params, body }) => {
    const res = await copyReportFromVersion(c.var.mainDb, {
      productId: params.product_id,
      versionId: params.version_id,
      label: body.label,
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
