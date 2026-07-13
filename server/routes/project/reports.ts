import { Hono } from "hono";
import {
  copyReportFromVersion,
  createReport,
  deleteReport,
  duplicateReport,
  getAllReports,
  getReportDetail,
  getReportVersion,
  getReportVersionLineage,
  insertReportVersion,
  latestReportVersionHash,
  listReportVersions,
  moveReportToFolder,
  restoreReportContent,
  updateReportBody,
  updateReportConfig,
  updateReportFigures,
  updateReportImages,
  updateReportLabel,
} from "../../db/mod.ts";
import {
  applyReportToLiveRoom,
  closeReportRoom,
  flushReportRoom,
} from "../../collab/report_rooms.ts";
import { compactTombstones } from "../../collab/authorship.ts";
import {
  drainVersionEditors,
  editorFromGlobalUser,
  loadReportVersionData,
  recordVersionEdit,
  reportContentHash,
} from "../../collab/version_capture.ts";
import { reportFiguresSchema, reportImagesSchema } from "lib";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectReportsUpdated } from "../../task_management/notify_project_v2.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesReports = new Hono();

defineRoute(
  routesReports,
  "getAllReports",
  requireProjectPermission("can_view_reports"),
  async (c) => {
    const res = await getAllReports(c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportDetail",
  requireProjectPermission("can_view_reports"),
  async (c, { params }) => {
    const res = await getReportDetail(c.var.ppk.projectDb, params.report_id);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "createReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { body }) => {
    const res = await createReport(
      c.var.ppk.projectDb,
      body.label,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.reportId],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportLabel",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await updateReportLabel(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(
      c.var.ppk.projectId,
      "report",
      params.report_id,
      editorFromGlobalUser(c.var.globalUser),
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportBody",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // While a collab room is live for this report, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead — the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately (which fires its own SSE
    // notifications). Merging into the live doc IS the conflict resolution,
    // so the room path reports conflicted: false.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { body: body.body },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated, conflicted: false },
      });
    }

    const res = await updateReportBody(
      c.var.ppk.projectDb,
      params.report_id,
      body.body,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    // Re-broadcast the summary list so the list-card preview (derived from the
    // body) stays fresh.
    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportFigures",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { figures: body.figures as any },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated },
      });
    }

    const res = await updateReportFigures(
      c.var.ppk.projectDb,
      params.report_id,
      body.figures as any,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportImages",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    // Live-room chokepoint — see updateReportBody.
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applyReportToLiveRoom(
      c.var.ppk.projectId,
      params.report_id,
      { images: body.images },
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated },
      });
    }

    const res = await updateReportImages(
      c.var.ppk.projectDb,
      params.report_id,
      body.images,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "report", params.report_id, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "updateReportConfig",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await updateReportConfig(
      c.var.ppk.projectDb,
      params.report_id,
      body.config,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [params.report_id],
      res.data.lastUpdated,
    );

    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "moveReportToFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await moveReportToFolder(
      c.var.ppk.projectDb,
      params.report_id,
      body.folderId,
    );
    if (res.success) {
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "duplicateReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await duplicateReport(
      c.var.ppk.projectDb,
      params.report_id,
      body.label,
      body.folderId,
    );
    if (res.success) {
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "deleteReport",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params }) => {
    const res = await deleteReport(c.var.ppk.projectDb, params.report_id);
    if (res.success) {
      // A live room left behind would fail its checkpoints forever — discard.
      closeReportRoom(
        c.var.ppk.projectId,
        params.report_id,
        "This report was deleted",
      );
      const reportsRes = await getAllReports(c.var.ppk.projectDb);
      if (reportsRes.success) {
        notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "listReportVersions",
  requireProjectPermission("can_view_reports"),
  async (c, { params }) => {
    const res = await listReportVersions(c.var.ppk.projectDb, params.report_id);
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportVersion",
  requireProjectPermission("can_view_reports"),
  async (c, { params }) => {
    const res = await getReportVersion(
      c.var.ppk.projectDb,
      params.report_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "getReportVersionLineage",
  requireProjectPermission("can_view_reports"),
  async (c, { params }) => {
    const res = await getReportVersionLineage(
      c.var.ppk.projectDb,
      params.report_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesReports,
  "restoreReportVersion",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params }) => {
    const projectId = c.var.ppk.projectId;
    const projectDb = c.var.ppk.projectDb;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getReportVersion(
      projectDb,
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
    await flushReportRoom(projectId, params.report_id);

    // Absorb the open editing session's attribution into the safety version;
    // left in the tracker it would hash-dedup against the restored state
    // later and those editors would never appear in any version.
    const drained = drainVersionEditors(projectId, "report", params.report_id);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit(projectId, "report", params.report_id, e);
      }
    };

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it's already the newest stored version).
    let current;
    try {
      current = await loadReportVersionData(projectId, params.report_id);
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
    const latestRes = await latestReportVersionHash(
      projectDb,
      params.report_id,
    );
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertReportVersion(projectDb, {
        reportId: params.report_id,
        createdAt: new Date().toISOString(),
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
    let lastUpdated = await applyReportToLiveRoom(projectId, params.report_id, {
      body: version.body,
      figures,
      images,
    });
    if (lastUpdated !== null) {
      // The label is not part of the room doc — restore it directly. A failed
      // label write means the restore is PARTIAL: report it as a failure (the
      // safety version exists; retrying is safe) and record no restored-state
      // version that would misrepresent the DB.
      const labelRes = await updateReportLabel(
        projectDb,
        params.report_id,
        version.label,
      );
      if (!labelRes.success) {
        notifyLastUpdated(projectId, "reports", [params.report_id], lastUpdated);
        return c.json({
          success: false as const,
          err:
            `Restored the content but failed to restore the report name: ${labelRes.err}`,
        });
      }
      lastUpdated = labelRes.data.lastUpdated;
    } else {
      const res = await restoreReportContent(projectDb, params.report_id, {
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
    const restoredRes = await insertReportVersion(projectDb, {
      reportId: params.report_id,
      createdAt: new Date().toISOString(),
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
      // The restored text keeps the authorship it had in the source version.
      bodyAuthors: version.bodyAuthors,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    // A room-path restore floods the live ledger with unknown-deleter
    // tombstones from the body rewrite — they must not leak into the next
    // session's version.
    compactTombstones(projectId, params.report_id);

    notifyLastUpdated(projectId, "reports", [params.report_id], lastUpdated);
    const reportsRes = await getAllReports(projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(projectId, reportsRes.data);
    }

    return c.json({ success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesReports,
  "copyReportVersion",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_reports",
  ),
  async (c, { params, body }) => {
    const res = await copyReportFromVersion(
      c.var.ppk.projectDb,
      params.report_id,
      params.version_id,
      body.label,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "reports",
      [res.data.newReportId],
      res.data.lastUpdated,
    );
    const reportsRes = await getAllReports(c.var.ppk.projectDb);
    if (reportsRes.success) {
      notifyProjectReportsUpdated(c.var.ppk.projectId, reportsRes.data);
    }

    return c.json(res);
  },
);
