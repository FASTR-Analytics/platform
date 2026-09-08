import { Hono } from "hono";
import {
  listSlideConfigTextElements,
  type Slide,
  slideConfigSchema,
  type SlideDeckConfig,
  slideDeckConfigSchema,
  type SlideDeckVersionSlide,
} from "lib";
import {
  copySlideDeckFromVersion,
  getSlideDeckDetail,
  getSlideDeckVersion,
  insertSlideDeckVersion,
  latestSlideDeckVersionHash,
  listSlideDeckVersions,
  planSlideDeckRestore,
  remapCollidingSlideIds,
  restoreSlideDeckStructure,
  updateSlide,
  updateSlideDeckConfig,
  updateSlideDeckPlan,
} from "../../db/products/mod.ts";
import {
  compactSlideElementTombstones,
  snapshotSlideElementAuthors,
} from "../../collab/authorship.ts";
import {
  drainDeckLedger,
  recordDeckSettingsEdited,
  restoreDeckLedger,
} from "../../collab/deck_session_ledger.ts";
import {
  applySlideToLiveRoom,
  closeSlideRoom,
  flushSlideRoom,
} from "../../collab/slide_rooms.ts";
import {
  drainVersionEditors,
  editorFromGlobalUser,
  hashVersionData,
  isoStrictlyAfter,
  loadSlideDeckVersionData,
  recordVersionEdit,
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
// the registry entry's `access`. The restore route is S16's: it flushes the
// live rooms, folds the open session into the safety version, closes the
// rooms of slides it removes or re-creates and merges surviving slides
// through their rooms.

defineRoute(
  routesProductSlideDecks,
  "getSlideDeckDetail",
  async (c, { params }) => {
    return respond(c, await getSlideDeckDetail(c.var.mainDb, params.product_id));
  },
);

defineRoute(
  routesProductSlideDecks,
  "updateSlideDeckPlan",
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
  "updateSlideDeckConfig",
  log("updateSlideDeckConfig"),
  async (c, { params, body }) => {
    const res = await updateSlideDeckConfig(
      c.var.mainDb,
      params.product_id,
      body.config as SlideDeckConfig,
    );
    if (!res.success) {
      return respond(c, res);
    }
    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.product_id, editor);
    recordDeckSettingsEdited(params.product_id, editor.email);
    await notifyInstanceProductsUpserted(c.var.mainDb, [params.product_id]);
    return respond(c, res);
  },
);

defineRoute(
  routesProductSlideDecks,
  "listSlideDeckVersions",
  async (c, { params }) => {
    return respond(
      c,
      await listSlideDeckVersions(c.var.mainDb, params.product_id),
    );
  },
);

defineRoute(
  routesProductSlideDecks,
  "getSlideDeckVersion",
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
  "restoreSlideDeckVersion",
  log("restoreSlideDeckVersion"),
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
    let snapshotSlides: SlideDeckVersionSlide[];
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

    // Persist any un-checkpointed live-room edits FIRST: the safety snapshot
    // below reads the DB, and live slide rooms can be up to 1.5s ahead of it.
    // A FAILED flush means that slide's row is stale, so the "safety" version
    // would not contain the current state: abort rather than overwrite the
    // deck while promising a rollback point we do not have.
    const idsRes = await getSlideDeckDetail(mainDb, productId);
    if (!idsRes.success) {
      return respond(c, idsRes);
    }
    for (const slideId of idsRes.data.slideIds) {
      if (!await flushSlideRoom(productId, slideId)) {
        return respond(c, {
          success: false as const,
          err:
            "This deck has unsaved live edits that could not be saved yet, so a safety version cannot be created. Please retry once saving recovers.",
        });
      }
    }

    // Absorb the open editing session's attribution into the safety version;
    // left in the tracker it would hash-dedup against the restored state
    // later and those editors would never appear in any version. The
    // per-slide ledger travels with it.
    const drained = drainVersionEditors("deck", productId);
    const drainedSlideEditors = drainDeckLedger(productId);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit("deck", productId, e);
      }
      restoreDeckLedger(productId, drainedSlideEditors);
    };

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it is already the newest stored version).
    let current;
    try {
      current = await loadSlideDeckVersionData(productId);
    } catch (error) {
      reinjectDrained();
      return respond(c, {
        success: false as const,
        err: error instanceof Error ? error.message : "Load failed",
      });
    }
    if (!current) {
      return respond(c, { success: false as const, err: "Slide deck not found" });
    }
    // Freeze the drained session's per-character element authorship into the
    // safety version, exactly like the tracker's writeVersion does: without
    // this, the pre-restore session's exact text attribution is lost and its
    // uncaptured tombstones would leak into the NEXT session's version.
    if (drainedSlideEditors) {
      for (const s of current.slides) {
        const sl = drainedSlideEditors.slides[s.id];
        if (!sl) continue;
        const authors = snapshotSlideElementAuthors(
          s.id,
          listSlideConfigTextElements(s.config),
        );
        if (Object.keys(authors).length > 0) sl.elementAuthors = authors;
      }
    }
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
        editors: drained.length > 0 ? drained : [restorer],
        contentHash: currentHash,
        slideEditors: drainedSlideEditors,
      });
      if (!safetyRes.success) {
        reinjectDrained();
        return respond(c, safetyRes);
      }
      // The safety version captured these tombstones: start the next window
      // for exactly the elements it captured (mirrors writeVersion).
      for (const s of current.slides) {
        const captured = drainedSlideEditors?.slides[s.id]?.elementAuthors;
        compactSlideElementTombstones(s.id, Object.keys(captured ?? {}));
      }
    }

    // Snapshot slide ids may have been reused by slides in other decks since
    // the snapshot was taken (uniqueness is checked against live rows only):
    // re-inserting those verbatim would abort on the primary key. Remap them
    // to fresh ids BEFORE closing rooms, so another deck's live room is never
    // touched.
    let plan = planSlideDeckRestore(
      current.slides.map((s) => s.id),
      snapshotSlides,
    );
    const remapRes = await remapCollidingSlideIds(mainDb, plan);
    if (!remapRes.success) {
      reinjectDrained();
      return respond(c, remapRes);
    }
    plan = remapRes.data.plan;

    // Discard rooms whose row is about to be deleted or re-created: a stale
    // room would fail checkpoints forever (deleted) or clobber the restored
    // row (re-inserted). Rooms of surviving slides stay alive: the restore
    // merges through them below, so co-editors follow it live.
    for (const id of plan.toDelete) {
      closeSlideRoom(productId, id, "This slide was removed by a version restore");
    }
    for (const s of plan.toInsert) {
      closeSlideRoom(productId, s.id, "This slide was replaced by a version restore");
    }

    const structRes = await restoreSlideDeckStructure(
      mainDb,
      productId,
      version.label,
      deckConfig,
      plan,
    );
    if (!structRes.success) {
      // Nothing was restored: put the drained session back, exactly like the
      // load, safety-insert and remap failure paths above.
      reinjectDrained();
      return respond(c, structRes);
    }
    let lastUpdated = structRes.data.lastUpdated;

    // Configs of surviving slides go through the live-room chokepoint (no
    // editor param: the restore versions itself below). Failures are
    // collected, not swallowed: a partial apply must not record a
    // restored-state version claiming the full snapshot, nor report success.
    const failedSlideIds: string[] = [];
    for (const s of plan.toUpdate) {
      const roomRes = await applySlideToLiveRoom(productId, s.id, s.config);
      if (roomRes.status === "saved") {
        lastUpdated = roomRes.lastUpdated;
      } else if (roomRes.status === "save_failed") {
        // The room absorbed the restore but could not persist it: partial
        // apply; no direct-write fallback (the room owns persistence).
        failedSlideIds.push(s.id);
      } else {
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

    // A room-path restore floods the surviving slides' element ledgers with
    // unknown-deleter tombstones from the config rewrite (syncSlideToDoc):
    // like the report route's compactTombstones, they must not leak into the
    // next session's version as phantom removed spans.
    for (const s of plan.toUpdate) {
      compactSlideElementTombstones(s.id);
    }

    return respond(c, { success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesProductSlideDecks,
  "copySlideDeckVersion",
  log("copySlideDeckVersion"),
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
