import { Hono } from "hono";
import {
  createProduct,
  deleteProducts,
  duplicateProduct,
  getProductSummaries,
  moveProductsToFolder,
  setProductPackage,
  setProductScope,
  updateProductLabel,
} from "../../db/mod.ts";
import { closeReportRoom } from "../../collab/report_rooms.ts";
import { closeSlideRoom } from "../../collab/slide_rooms.ts";
import {
  editorFromGlobalUser,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { recordDeckSettingsEdited } from "../../collab/deck_session_ledger.ts";
import { log } from "../../middleware/logging.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import {
  notifyInstanceProductsDeleted,
  notifyInstanceProductsUpserted,
  notifyInstanceRunsCatalogUpdated,
  notifyProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesProducts = new Hono();

// The cross-type product surface: label, folder, package, scope, duplicate and
// delete treat a deck and a report alike, so there is ONE set of routes for
// them (D1). Per-type files carry content and versions only.
//
// Every route is guarded by requireApprovedUser() and nothing finer: the
// product id in the path IS the authority (D2). Never add a per-handler
// permission check behind this guard — a future permission scheme replaces the
// guard itself with a product-aware one (SYSTEM_01).

// Every route that changes a product re-reads the touched summaries and
// broadcasts them through notifyProductsUpserted: products_upserted is the
// ONLY product-list message (S3), and a summary's own `lastUpdated` is what
// versions that product's detail cache.
defineRoute(
  routesProducts,
  "createProduct",
  requireApprovedUser(),
  log("createProduct"),
  async (c, { body }) => {
    // NO_READY_PINNED_PACKAGE comes back through the envelope, not as a throw:
    // the Products page renders it as "an admin must generate a results
    // package" rather than a generic failure toast.
    const res = await createProduct(c.var.mainDb, {
      type: body.type,
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

defineRoute(
  routesProducts,
  "updateProductLabel",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateProductLabel(
      c.var.mainDb,
      params.product_id,
      body.label,
    );
    if (!res.success) {
      return c.json(res);
    }

    // The rename is attributed to the open editing session so it appears in
    // the next version — the version kind follows the product's type, which is
    // the summary the broadcast needs anyway.
    const summaryRes = await getProductSummaries(c.var.mainDb, [
      params.product_id,
    ]);
    if (summaryRes.success) {
      notifyInstanceProductsUpserted(summaryRes.data);
      const editor = editorFromGlobalUser(c.var.globalUser);
      for (const summary of summaryRes.data) {
        if (summary.type === "slide_deck") {
          recordVersionEdit("deck", summary.id, editor);
          recordDeckSettingsEdited(summary.id, editor.email);
          continue;
        }
        recordVersionEdit("report", summary.id, editor);
      }
    }

    return c.json(res);
  },
);

defineRoute(
  routesProducts,
  "moveProductsToFolder",
  requireApprovedUser(),
  async (c, { body }) => {
    const res = await moveProductsToFolder(
      c.var.mainDb,
      body.productIds,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    // Only the rows the UPDATE actually touched — a requested id that no
    // longer exists must not be re-broadcast as a live product.
    await notifyProductsUpserted(c.var.mainDb, res.data.movedIds);

    // `movedIds` is a server-internal detail — the client learns which rows
    // changed from the products_upserted above, not from this response.
    return c.json({
      success: true as const,
      data: { lastUpdated: res.data.lastUpdated },
    });
  },
);

defineRoute(
  routesProducts,
  "deleteProducts",
  requireApprovedUser(),
  log("deleteProducts"),
  async (c, { body }) => {
    // Types must be read BEFORE the delete: the rooms to discard depend on
    // them, and after the CASCADE the rows are unrecoverable. A transient read
    // failure therefore aborts the delete — deleting anyway would leave every
    // live room a zombie, failing its checkpoints forever.
    const summariesRes = await getProductSummaries(
      c.var.mainDb,
      body.productIds,
    );
    if (!summariesRes.success) {
      return c.json(summariesRes);
    }
    const reportIds = new Set(
      summariesRes.data.filter((p) => p.type === "report").map((p) => p.id),
    );

    // Slide ids are pre-read INSIDE the delete transaction and come back with
    // the result (see deleteProducts in db/products/products.ts).
    const res = await deleteProducts(c.var.mainDb, body.productIds);
    if (!res.success) {
      return c.json(res);
    }

    // A live room left on a deleted row would fail its checkpoints forever
    // (and clobber any future row re-created with the same id) — discard it,
    // which also drops the slide's authorship ledgers and element touches.
    for (const slideId of res.data.deletedSlideIds) {
      closeSlideRoom(slideId, "This slide was deleted");
    }
    for (const productId of res.data.deletedIds) {
      if (reportIds.has(productId)) {
        closeReportRoom(productId, "This report was deleted");
      }
    }

    notifyInstanceProductsDeleted(res.data.deletedIds);

    // `deletedSlideIds` existed only to close the rooms above.
    return c.json({
      success: true as const,
      data: { deletedIds: res.data.deletedIds },
    });
  },
);

defineRoute(
  routesProducts,
  "setProductPackage",
  requireApprovedUser(),
  log("setProductPackage"),
  async (c, { params, body }) => {
    const res = await setProductPackage(
      c.var.mainDb,
      params.product_id,
      body.runId,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [params.product_id]);
    // A repoint changes the catalogue's "in use by" column and therefore which
    // packages are deletable, so the catalogue has to re-fetch. Without this
    // an admin reads a package as unused, clicks delete and is refused by the
    // guard inside the DELETE — the one outcome the catalogue's copy promises
    // will never be a mystery.
    notifyInstanceRunsCatalogUpdated();

    return c.json(res);
  },
);

defineRoute(
  routesProducts,
  "setProductScope",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await setProductScope(
      c.var.mainDb,
      params.product_id,
      body.adminArea2,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [params.product_id]);

    return c.json(res);
  },
);

defineRoute(
  routesProducts,
  "duplicateProduct",
  requireApprovedUser(),
  log("duplicateProduct"),
  async (c, { params }) => {
    const res = await duplicateProduct(
      c.var.mainDb,
      params.product_id,
      c.var.globalUser.email,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [res.data.productId]);

    return c.json(res);
  },
);
