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
  loadReportVersionData,
  restoreReportContent,
  updateReportBody,
  updateReportConfig,
  updateReportFigures,
  updateReportImages,
} from "../../db/products/mod.ts";
import {
  editorFromGlobalUser,
  isoStrictlyAfter,
  reportContentHash,
} from "../../collab/version_capture.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceProductsUpserted } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductReports = new Hono();

// Report content and versions only: label, folder, package, scope,
// duplicate and delete are the shared product routes (./products.ts). The
// guard is the registry entry's `access`. The live-room chokepoint, the
// room flush and the tombstone compaction arrive with collab in 7a.

defineRoute(
  routesProductReports,
  "getProductReportDetail",
  async (c, { params }) => {
    return respond(c, await getReportDetail(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductReports,
  "updateProductReportBody",
  async (c, { params, body }) => {
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
    // The summary's hasEmbeds derives from the body, so the re-broadcast
    // keeps the product list fresh as well as the cache.
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductReports,
  "updateProductReportFigures",
  async (c, { params, body }) => {
    const res = await updateReportFigures(
      c.var.mainDb,
      params.product_id,
      body.figures,
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
  "updateProductReportImages",
  async (c, { params, body }) => {
    const res = await updateReportImages(
      c.var.mainDb,
      params.product_id,
      body.images,
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
  "updateProductReportConfig",
  log("updateProductReportConfig"),
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
  "listProductReportVersions",
  async (c, { params }) => {
    return respond(c, await listReportVersions(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductReports,
  "getProductReportVersion",
  async (c, { params }) => {
    return respond(
      c,
      await getReportVersion(c.var.mainDb, params.product_id, params.version_id),
    );
  },
);

defineRoute(
  routesProductReports,
  "getProductReportVersionLineage",
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
  "restoreProductReportVersion",
  log("restoreProductReportVersion"),
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
    // transforms.
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

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it is already the newest stored version).
    const currentRes = await loadReportVersionData(mainDb, productId);
    if (!currentRes.success) {
      return respond(c, currentRes);
    }
    const current = currentRes.data;
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
        editors: [restorer],
        contentHash: currentHash,
        bodyAuthors: current.bodyAuthors,
      });
      if (!safetyRes.success) {
        return respond(c, safetyRes);
      }
    }

    const res = await restoreReportContent(mainDb, productId, {
      label: version.label,
      body: version.body,
      figures,
      images,
    });
    if (!res.success) {
      return respond(c, res);
    }
    const lastUpdated = res.data.lastUpdated;

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

    await notifyInstanceProductsUpserted(mainDb, [productId]);
    return respond(c, { success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesProductReports,
  "copyProductReportVersion",
  log("copyProductReportVersion"),
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
