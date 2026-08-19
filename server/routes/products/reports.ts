import { Hono } from "hono";
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
} from "../../db/mod.ts";
import {
  applyReportToLiveRoom,
  flushReportRoom,
} from "../../collab/report_rooms.ts";
import { compactTombstones } from "../../collab/authorship.ts";
import {
  drainVersionEditors,
  editorFromGlobalUser,
  isoStrictlyAfter,
  loadReportVersionData,
  recordVersionEdit,
  reportContentHash,
} from "../../collab/version_capture.ts";
import {
  reportFiguresSchema,
  reportImagesSchema,
  stripTombstoneRuns,
} from "lib";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { log } from "../../middleware/logging.ts";
import { notifyProductsUpserted } from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesReports = new Hono();

// Report CONTENT and versions only — label, folder, package, scope, duplicate
// and delete are the shared product routes (./products.ts). report_id IS the
// product id, and requireApprovedUser() is the whole guard (D2).

defineRoute(
  routesReports,
  "getReportDetail",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getReportDetail(c.var.mainDb, params.report_id);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportBody",
  requireApprovedUser(),
  async (c, { params, body }) => {
    // While a collab room is live for this report, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead — the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately (which fires its own SSE
    // notifications, products_upserted included). Merging into the live doc IS
    // the conflict resolution, so the room path reports conflicted: false.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.report_id,
      { body: body.body },
      editor,
    );
    if (roomRes.status === "saved") {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated, conflicted: false },
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

    const res = await updateReportBody(
      c.var.mainDb,
      params.report_id,
      body.body,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit("report", params.report_id, editor);

    // The summary carries the card preview, which derives from the body — so
    // the re-broadcast keeps the Products page fresh as well as the cache.
    await notifyProductsUpserted(c.var.mainDb, [params.report_id]);

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportFigures",
  requireApprovedUser(),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.report_id,
      { figures: body.figures },
      editor,
    );
    if (roomRes.status === "saved") {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      // See updateReportBody — no direct-write fallback on a failed room save.
      return c.json({
        success: false as const,
        err: "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.",
      });
    }

    const res = await updateReportFigures(
      c.var.mainDb,
      params.report_id,
      body.figures,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit("report", params.report_id, editor);

    await notifyProductsUpserted(c.var.mainDb, [params.report_id]);

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportImages",
  requireApprovedUser(),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomRes = await applyReportToLiveRoom(
      params.report_id,
      { images: body.images },
      editor,
    );
    if (roomRes.status === "saved") {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomRes.lastUpdated },
      });
    }
    if (roomRes.status === "save_failed") {
      // See updateReportBody — no direct-write fallback on a failed room save.
      return c.json({
        success: false as const,
        err: "The change was applied to the live editing session but could not be saved yet. Saving will retry automatically.",
      });
    }

    const res = await updateReportImages(
      c.var.mainDb,
      params.report_id,
      body.images,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit("report", params.report_id, editor);

    await notifyProductsUpserted(c.var.mainDb, [params.report_id]);

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportConfig",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.mainDb,
      params.report_id,
      body.config,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [params.report_id]);

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "listReportVersions",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await listReportVersions(c.var.mainDb, params.report_id);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportVersion",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getReportVersion(
      c.var.mainDb,
      params.report_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportVersionLineage",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getReportVersionLineage(
      c.var.mainDb,
      params.report_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "restoreReportVersion",
  requireApprovedUser(),
  log("restoreReportVersion"),
  async (c, { params }) => {
    const mainDb = c.var.mainDb;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getReportVersion(
      mainDb,
      params.report_id,
      params.version_id,
    );
    if (!versionRes.success) {
      return c.json(versionRes);
    }
    const version = versionRes.data;

    // Validate the snapshot against the CURRENT schemas before touching
    // anything (version snapshots are stored verbatim and are not swept by
    // migration transforms). Applying unvalidated content to a live room would
    // poison it: every checkpoint's schema parse would fail forever.
    let figures: typeof version.figures;
    let images: typeof version.images;
    try {
      figures = reportFiguresSchema.parse(version.figures);
      images = reportImagesSchema.parse(version.images);
    } catch {
      return c.json({
        success: false as const,
        err:
          "This version's content is no longer compatible with the current app version and cannot be restored.",
      });
    }

    // Persist any un-checkpointed live-room edits FIRST — the safety snapshot
    // below reads the DB, and a live room can be up to 1.5s ahead of it.
    // A FAILED flush means the row is stale, so the "safety" version would not
    // actually contain the current state — abort rather than overwrite the
    // document with a snapshot while promising a rollback point we don't have.
    if (!await flushReportRoom(params.report_id)) {
      return c.json({
        success: false as const,
        err:
          "This report has unsaved live edits that could not be saved yet, so a safety version cannot be created. Please retry once saving recovers.",
      });
    }

    // Absorb the open editing session's attribution into the safety version;
    // left in the tracker it would hash-dedup against the restored state
    // later and those editors would never appear in any version.
    const drained = drainVersionEditors("report", params.report_id);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit("report", params.report_id, e);
      }
    };

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it's already the newest stored version).
    let current;
    try {
      current = await loadReportVersionData(params.report_id);
    } catch (error) {
      reinjectDrained();
      return c.json({
        success: false as const,
        err: error instanceof Error ? error.message : "Load failed",
      });
    }
    if (!current) {
      return c.json({ success: false as const, err: "Report not found" });
    }
    const currentHash = reportContentHash(current);
    const latestRes = await latestReportVersionHash(mainDb, params.report_id);
    const safetyCreatedAt = new Date().toISOString();
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertReportVersion(mainDb, {
        reportId: params.report_id,
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
        return c.json(safetyRes);
      }
    }

    // Apply the snapshot through a live room when one exists, so co-editors
    // follow the restore live. No editor param: the restore versions itself
    // below instead of going through the session tracker.
    const roomRes = await applyReportToLiveRoom(params.report_id, {
      body: version.body,
      figures,
      images,
    });
    if (roomRes.status === "save_failed") {
      // The room absorbed the snapshot but couldn't persist it — the restore
      // is PARTIAL (co-editors see it; the DB doesn't). No direct-write
      // fallback (the room owns persistence), and no restored-state version
      // below that would misrepresent the DB. The safety version exists;
      // retrying is safe.
      reinjectDrained();
      return c.json({
        success: false as const,
        err:
          "The restore was applied to the live editing session but could not be saved yet. Saving will retry automatically; please retry the restore if it does not appear.",
      });
    }
    let lastUpdated: string;
    if (roomRes.status === "saved") {
      lastUpdated = roomRes.lastUpdated;
      // The label lives on the `products` row, not in the room doc — restore
      // it directly. A failed label write means the restore is PARTIAL: report
      // it as a failure (the safety version exists; retrying is safe) and
      // record no restored-state version that would misrepresent the DB.
      const labelRes = await updateProductLabel(
        mainDb,
        params.report_id,
        version.label,
      );
      if (!labelRes.success) {
        await notifyProductsUpserted(mainDb, [params.report_id]);
        return c.json({
          success: false as const,
          err:
            `Restored the content but failed to restore the report name: ${labelRes.err}`,
        });
      }
      lastUpdated = labelRes.data.lastUpdated;
    } else {
      const res = await restoreReportContent(mainDb, params.report_id, {
        label: version.label,
        body: version.body,
        figures,
        images,
      });
      if (!res.success) {
        return c.json(res);
      }
      lastUpdated = res.data.lastUpdated;
    }

    // The restore itself appears in history (content restored successfully at
    // this point, so a failed history insert must not fail the request). Uses
    // the schema-normalized content, hashed through reportContentHash — the
    // ONE definition of the report hash field set — so it matches what a
    // later capture computes from the DB (a divergent hash here would break
    // the dedup chain and duplicate versions).
    const restoredRes = await insertReportVersion(mainDb, {
      reportId: params.report_id,
      // Strictly after the safety version even within one millisecond — the
      // two are ordered by (created_at, id) everywhere, and a tie would let
      // the restored state sort BEFORE the state it replaced.
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
      // The restored text keeps the authorship it had in the source version —
      // LIVE runs only. The source's tombstones describe deletions made in
      // that old session (already captured by that version); carried along
      // they would misattribute what THIS restore removed to those deleters.
      bodyAuthors: version.bodyAuthors
        ? stripTombstoneRuns(version.bodyAuthors)
        : null,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    // A room-path restore floods the live ledger with unknown-deleter
    // tombstones from the body rewrite — they must not leak into the next
    // session's version.
    compactTombstones(params.report_id);

    await notifyProductsUpserted(mainDb, [params.report_id]);

    return c.json({ success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesReports,
  "copyReportVersion",
  requireApprovedUser(),
  log("copyReportVersion"),
  async (c, { params, body }) => {
    // "Restore as copy" mints a NEW product, so it carries a label and folder
    // like createProduct does — and inherits the source report's (run_id,
    // scope) pair verbatim (D4).
    const res = await copyReportFromVersion(c.var.mainDb, {
      reportId: params.report_id,
      versionId: params.version_id,
      label: body.label,
      folderId: body.folderId,
      createdBy: c.var.globalUser.email,
    });
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [res.data.productId]);

    return c.json(res);
  },
);
