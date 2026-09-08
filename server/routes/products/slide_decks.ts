import { Hono } from "hono";
import {
  type DeckVersionSlide,
  type Slide,
  slideConfigSchema,
  type SlideDeckConfig,
  slideDeckConfigSchema,
} from "lib";
import {
  copySlideDeckFromVersion,
  getSlideDeckDetail,
  getSlideDeckVersion,
  insertSlideDeckVersion,
  latestSlideDeckVersionHash,
  listSlideDeckVersions,
  loadSlideDeckVersionData,
  planSlideDeckRestore,
  remapCollidingSlideIds,
  restoreSlideDeckStructure,
  updateSlide,
  updateSlideDeckConfig,
  updateSlideDeckPlan,
} from "../../db/products/mod.ts";
import {
  editorFromGlobalUser,
  hashVersionData,
  isoStrictlyAfter,
} from "../../collab/version_capture.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyInstanceLastUpdated,
  notifyInstanceProductsUpserted,
} from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { respond } from "./_respond.ts";

export const routesProductSlideDecks = new Hono();

// Deck content and versions only: label, folder, package, scope, duplicate
// and delete are the shared product routes (./products.ts). The guard is
// the registry entry's `access`. Room flushes, the live-room apply and the
// session ledgers arrive with collab in 7a.

defineRoute(
  routesProductSlideDecks,
  "getProductSlideDeckDetail",
  async (c, { params }) => {
    return respond(c, await getSlideDeckDetail(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductSlideDecks,
  "updateProductSlideDeckPlan",
  async (c, { params, body }) => {
    const res = await updateSlideDeckPlan(
      c.var.mainDb,
      params.product_id,
      body.plan,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlideDecks,
  "updateProductSlideDeckConfig",
  log("updateProductSlideDeckConfig"),
  async (c, { params, body }) => {
    const res = await updateSlideDeckConfig(
      c.var.mainDb,
      params.product_id,
      body.config as SlideDeckConfig,
    );
    if (!res.success) {
      return respond(c, res);
    }
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlideDecks,
  "listProductSlideDeckVersions",
  async (c, { params }) => {
    return respond(
      c,
      await listSlideDeckVersions(c.var.mainDb, params.product_id),
    );
  },
);

defineRoute(
  routesProductSlideDecks,
  "getProductSlideDeckVersion",
  async (c, { params }) => {
    return respond(
      c,
      await getSlideDeckVersion(
        c.var.mainDb,
        params.product_id,
        params.version_id,
      ),
    );
  },
);

defineRoute(
  routesProductSlideDecks,
  "restoreProductSlideDeckVersion",
  log("restoreProductSlideDeckVersion"),
  async (c, { params }) => {
    const mainDb = c.var.mainDb;
    const productId = params.product_id;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getSlideDeckVersion(
      mainDb,
      productId,
      params.version_id,
    );
    if (!versionRes.success) {
      return respond(c, versionRes);
    }
    const version = versionRes.data;

    // Validate the whole snapshot against the CURRENT schemas before touching
    // anything (snapshots are stored verbatim; migrations do not sweep them),
    // and renumber to capture form so the restored-state hash matches what a
    // later capture computes.
    let deckConfig: SlideDeckConfig;
    let snapshotSlides: DeckVersionSlide[];
    try {
      deckConfig = slideDeckConfigSchema.parse(
        version.deckConfig,
      ) as SlideDeckConfig;
      snapshotSlides = version.slides
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s, i) => ({
          id: s.id,
          sortOrder: (i + 1) * 10,
          config: slideConfigSchema.parse(s.config) as Slide,
        }));
    } catch {
      return respond(c, {
        success: false as const,
        err:
          "This version's content is no longer compatible with the current app version and cannot be restored.",
      });
    }

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it is already the newest stored version).
    const currentRes = await loadSlideDeckVersionData(mainDb, productId);
    if (!currentRes.success) {
      return respond(c, currentRes);
    }
    const current = currentRes.data;
    const safetyCreatedAt = new Date().toISOString();
    const currentHash = hashVersionData(current);
    const latestRes = await latestSlideDeckVersionHash(mainDb, productId);
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertSlideDeckVersion(mainDb, {
        productId,
        createdAt: safetyCreatedAt,
        label: current.label,
        deckConfig: current.deckConfig,
        slides: current.slides,
        editors: [restorer],
        contentHash: currentHash,
      });
      if (!safetyRes.success) {
        return respond(c, safetyRes);
      }
    }

    // Snapshot slide ids may have been reused by slides in other decks since
    // the snapshot was taken; remap those to fresh ids before inserting.
    let plan = planSlideDeckRestore(
      current.slides.map((s) => s.id),
      snapshotSlides,
    );
    const remapRes = await remapCollidingSlideIds(mainDb, plan);
    if (!remapRes.success) {
      return respond(c, remapRes);
    }
    plan = remapRes.data.plan;

    const structRes = await restoreSlideDeckStructure(
      mainDb,
      productId,
      version.label,
      deckConfig,
      plan,
    );
    if (!structRes.success) {
      return respond(c, structRes);
    }
    let lastUpdated = structRes.data.lastUpdated;

    // Configs of surviving slides are written one by one; failures are
    // collected, not swallowed, so a partial apply never records a
    // restored-state version claiming the full snapshot.
    const failedSlideIds: string[] = [];
    for (const s of plan.toUpdate) {
      const res = await updateSlide(
        mainDb,
        productId,
        s.id,
        s.config,
        undefined,
        undefined,
      );
      if (res.success) {
        lastUpdated = res.data.lastUpdated;
      } else {
        failedSlideIds.push(s.id);
      }
    }

    const touchedSlideIds = [
      ...new Set([
        ...plan.toDelete,
        ...plan.toInsert.map((s) => s.id),
        ...plan.toUpdate.map((s) => s.id),
      ]),
    ];
    notifyInstanceLastUpdated("slides", touchedSlideIds, lastUpdated);
    await notifyInstanceProductsUpserted(mainDb, [productId]);

    if (failedSlideIds.length > 0) {
      // The safety version exists and the structure is in place, so retrying
      // the restore is safe.
      return respond(c, {
        success: false as const,
        err:
          `Restored the deck structure, but ${failedSlideIds.length} slide(s) failed to update. Please retry the restore.`,
      });
    }

    // The restore itself appears in history: the post-remap ids and the
    // normalized configs, exactly what the DB now holds. It is fully applied
    // at this point, so a failed history insert must not fail the request.
    const restoredSlides = [...plan.toInsert, ...plan.toUpdate]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s, i) => ({ id: s.id, sortOrder: (i + 1) * 10, config: s.config }));
    const restoredData = { label: version.label, deckConfig, slides: restoredSlides };
    const restoredRes = await insertSlideDeckVersion(mainDb, {
      productId,
      // Strictly after the safety version even within one millisecond: the
      // two are ordered by (created_at, id) everywhere.
      createdAt: isoStrictlyAfter(safetyCreatedAt),
      label: version.label,
      deckConfig,
      slides: restoredSlides,
      editors: [restorer],
      contentHash: hashVersionData(restoredData),
      restoredFromVersionId: version.id,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    return respond(c, { success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesProductSlideDecks,
  "copyProductSlideDeckVersion",
  log("copyProductSlideDeckVersion"),
  async (c, { params, body }) => {
    const res = await copySlideDeckFromVersion(c.var.mainDb, {
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
