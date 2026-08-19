import { Hono } from "hono";
import {
  copyDeckFromVersion,
  getDeckVersion,
  getSlideDeckDetail,
  insertDeckVersion,
  latestDeckVersionHash,
  listDeckVersions,
  planDeckRestore,
  remapCollidingSlideIds,
  restoreDeckStructure,
  updateSlide,
  updateSlideDeckConfig,
  updateSlideDeckPlan,
} from "../../db/mod.ts";
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
  loadDeckVersionData,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import {
  drainDeckLedger,
  recordDeckSettingsEdited,
  restoreDeckLedger,
} from "../../collab/deck_session_ledger.ts";
import {
  compactSlideElementTombstones,
  snapshotSlideElementAuthors,
} from "../../collab/authorship.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { log } from "../../middleware/logging.ts";
import {
  notifyLastUpdated,
  notifyProductsUpserted,
} from "../../task_management/mod.ts";
import {
  type DeckVersionSlide,
  listSlideConfigTextElements,
  type Slide,
  slideConfigSchema,
  type SlideDeckConfig,
  slideDeckConfigSchema,
} from "lib";
import { defineRoute } from "../route-helpers.ts";

export const routesSlideDecks = new Hono();

// Deck CONTENT and versions only — label, folder, package, scope, duplicate
// and delete are the shared product routes (./products.ts). deck_id IS the
// product id, and requireApprovedUser() is the whole guard: the id in the path
// is the authority (D2).

defineRoute(
  routesSlideDecks,
  "getSlideDeckDetail",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getSlideDeckDetail(c.var.mainDb, params.deck_id);
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckPlan",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateSlideDeckPlan(
      c.var.mainDb,
      params.deck_id,
      body.plan,
    );
    if (!res.success) {
      return c.json(res);
    }

    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckConfig",
  requireApprovedUser(),
  async (c, { params, body }) => {
    const res = await updateSlideDeckConfig(
      c.var.mainDb,
      params.deck_id,
      body.config as SlideDeckConfig,
    );
    if (!res.success) {
      return c.json(res);
    }

    const editor = editorFromGlobalUser(c.var.globalUser);
    recordVersionEdit("deck", params.deck_id, editor);
    recordDeckSettingsEdited(params.deck_id, editor.email);

    await notifyProductsUpserted(c.var.mainDb, [params.deck_id]);

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "listDeckVersions",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await listDeckVersions(c.var.mainDb, params.deck_id);
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "getDeckVersion",
  requireApprovedUser(),
  async (c, { params }) => {
    const res = await getDeckVersion(
      c.var.mainDb,
      params.deck_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "restoreDeckVersion",
  requireApprovedUser(),
  log("restoreDeckVersion"),
  async (c, { params }) => {
    const mainDb = c.var.mainDb;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getDeckVersion(
      mainDb,
      params.deck_id,
      params.version_id,
    );
    if (!versionRes.success) {
      return c.json(versionRes);
    }
    const version = versionRes.data;

    // Validate the whole snapshot against the CURRENT schemas before touching
    // anything (snapshots are stored verbatim; migrations don't sweep them).
    // This also normalizes: renumber to capture form ((i+1)*10 in order) so
    // the restored-state hash matches what the tracker computes afterwards.
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
      return c.json({
        success: false as const,
        err:
          "This version's content is no longer compatible with the current app version and cannot be restored.",
      });
    }

    // Persist any un-checkpointed live-room edits FIRST — the safety snapshot
    // below reads the DB, and live slide rooms can be up to 1.5s ahead of it.
    const idsRes = await getSlideDeckDetail(mainDb, params.deck_id);
    if (!idsRes.success) {
      return c.json(idsRes);
    }
    // A FAILED flush means that slide's row is stale, so the "safety" version
    // would not contain the current state — abort rather than overwrite the
    // deck while promising a rollback point we don't have.
    for (const slideId of idsRes.data.slideIds) {
      if (!await flushSlideRoom(slideId)) {
        return c.json({
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
    const drained = drainVersionEditors("deck", params.deck_id);
    const drainedSlideEditors = drainDeckLedger(params.deck_id);
    const reinjectDrained = () => {
      for (const e of drained) {
        recordVersionEdit("deck", params.deck_id, e);
      }
      restoreDeckLedger(params.deck_id, drainedSlideEditors);
    };

    // Safety version: the current state is preserved before anything is
    // overwritten (skipped when it's already the newest stored version).
    let current;
    try {
      current = await loadDeckVersionData(params.deck_id);
    } catch (error) {
      reinjectDrained();
      return c.json({
        success: false as const,
        err: error instanceof Error ? error.message : "Load failed",
      });
    }
    if (!current) {
      return c.json({ success: false as const, err: "Slide deck not found" });
    }
    // Freeze the drained session's per-character element authorship into the
    // safety version, exactly like the tracker's writeVersion does — without
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
    const latestRes = await latestDeckVersionHash(mainDb, params.deck_id);
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertDeckVersion(mainDb, {
        deckId: params.deck_id,
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
        return c.json(safetyRes);
      }
      // The safety version captured these tombstones — start the next window
      // for exactly the elements it captured (mirrors writeVersion).
      for (const s of current.slides) {
        const captured = drainedSlideEditors?.slides[s.id]?.elementAuthors;
        compactSlideElementTombstones(s.id, Object.keys(captured ?? {}));
      }
    }

    // Snapshot slide ids may have been REUSED by slides in other decks since
    // the snapshot was taken (3-char ids, uniqueness checked against live rows
    // only) — re-inserting those verbatim would abort on the primary key.
    // Remap them to fresh ids BEFORE closing rooms, so another deck's live
    // room is never touched.
    let plan = planDeckRestore(
      current.slides.map((s) => s.id),
      snapshotSlides,
    );
    const remapRes = await remapCollidingSlideIds(mainDb, plan);
    if (!remapRes.success) {
      reinjectDrained();
      return c.json(remapRes);
    }
    plan = remapRes.data.plan;

    // Discard rooms whose row is about to be deleted or re-created — a stale
    // room would fail checkpoints forever (deleted) or clobber the restored
    // row (re-inserted). Rooms of surviving slides stay alive: the restore
    // merges through them below, so co-editors follow it live.
    for (const id of plan.toDelete) {
      closeSlideRoom(id, "This slide was removed by a version restore");
    }
    for (const s of plan.toInsert) {
      closeSlideRoom(s.id, "This slide was replaced by a version restore");
    }

    const structRes = await restoreDeckStructure(
      mainDb,
      params.deck_id,
      version.label,
      deckConfig,
      plan,
    );
    if (!structRes.success) {
      // Nothing was restored — put the drained session back, exactly like the
      // load/safety-insert/remap failure paths above. Without this the drained
      // editors and the per-slide element ledger are dropped on the floor, and
      // when the safety version was skipped by hash-dedup that attribution is
      // lost outright.
      reinjectDrained();
      return c.json(structRes);
    }
    let lastUpdated = structRes.data.lastUpdated;

    // Configs of surviving slides go through the live-room chokepoint (no
    // editor param: the restore versions itself below). Failures are
    // collected, not swallowed — a partial apply must not record a
    // restored-state version claiming the full snapshot, nor report success.
    const failedSlideIds: string[] = [];
    for (const s of plan.toUpdate) {
      const roomRes = await applySlideToLiveRoom(s.id, s.config);
      if (roomRes.status === "saved") {
        lastUpdated = roomRes.lastUpdated;
      } else if (roomRes.status === "save_failed") {
        // Room absorbed the restore but couldn't persist it — partial apply;
        // no direct-write fallback (the room owns persistence).
        failedSlideIds.push(s.id);
      } else {
        const res = await updateSlide(
          mainDb,
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
    notifyLastUpdated("slides", touchedSlideIds, lastUpdated);
    await notifyProductsUpserted(mainDb, [params.deck_id]);

    if (failedSlideIds.length > 0) {
      // The deck is partially restored. The safety version exists and the
      // structure is in place, so retrying the restore is safe.
      return c.json({
        success: false as const,
        err:
          `Restored the deck structure, but ${failedSlideIds.length} slide(s) failed to update. Please retry the restore.`,
      });
    }

    // The restore itself appears in history (fully applied at this point, so
    // a failed history insert must not fail the request). Records the
    // post-remap ids + normalized configs — exactly what the DB now holds.
    const restoredSlides = [...plan.toInsert, ...plan.toUpdate]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s, i) => ({ id: s.id, sortOrder: (i + 1) * 10, config: s.config }));
    const restoredData = {
      label: version.label,
      deckConfig,
      slides: restoredSlides,
    };
    const restoredRes = await insertDeckVersion(mainDb, {
      deckId: params.deck_id,
      // Strictly after the safety version even within one millisecond — the
      // two are ordered by (created_at, id) everywhere, and a tie would let
      // the restored state sort BEFORE the state it replaced.
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
    // unknown-deleter tombstones from the config rewrite (syncSlideToDoc) —
    // like the report route's compactTombstones, they must not leak into the
    // next session's version as phantom removed spans.
    for (const s of plan.toUpdate) {
      compactSlideElementTombstones(s.id);
    }

    return c.json({ success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesSlideDecks,
  "copyDeckVersion",
  requireApprovedUser(),
  log("copyDeckVersion"),
  async (c, { params, body }) => {
    // "Restore as copy" mints a NEW product, so it carries a label and folder
    // like createProduct does — and inherits the source deck's (run_id, scope)
    // pair verbatim (D4).
    const res = await copyDeckFromVersion(c.var.mainDb, {
      deckId: params.deck_id,
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
