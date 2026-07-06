import { Hono } from "hono";
import {
  getAllSlideDecks,
  getSlideDeckDetail,
  createSlideDeck,
  updateSlideDeckLabel,
  updateSlideDeckPlan,
  updateSlideDeckConfig,
  moveSlideDeckToFolder,
  duplicateSlideDeck,
  deleteSlideDeck,
  copyDeckFromVersion,
  getDeckVersion,
  insertDeckVersion,
  latestDeckVersionHash,
  listDeckVersions,
  planDeckRestore,
  restoreDeckStructure,
  updateSlide,
} from "../../db/mod.ts";
import {
  applySlideToLiveRoom,
  closeSlideRoom,
} from "../../collab/slide_rooms.ts";
import {
  editorFromGlobalUser,
  hashVersionData,
  loadDeckVersionData,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectSlideDecksUpdated } from "../../task_management/notify_project_v2.ts";
import { SlideDeckConfig } from "lib";
import { defineRoute } from "../route-helpers.ts";

export const routesSlideDecks = new Hono();

defineRoute(
  routesSlideDecks,
  "getAllSlideDecks",
  requireProjectPermission("can_view_slide_decks"),
  async (c) => {
    const res = await getAllSlideDecks(c.var.ppk.projectDb);
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "getSlideDeckDetail",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await getSlideDeckDetail(c.var.ppk.projectDb, params.deck_id);
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "createSlideDeck",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { body }) => {
    const res = await createSlideDeck(
      c.var.ppk.projectDb,
      body.label,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [res.data.deckId],
      res.data.lastUpdated,
    );

    const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
    if (decksRes.success) {
      notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckLabel",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateSlideDeckLabel(
      c.var.ppk.projectDb,
      params.deck_id,
      body.label,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(
      c.var.ppk.projectId,
      "deck",
      params.deck_id,
      editorFromGlobalUser(c.var.globalUser),
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated,
    );

    const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
    if (decksRes.success) {
      notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckPlan",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateSlideDeckPlan(
      c.var.ppk.projectDb,
      params.deck_id,
      body.plan,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckConfig",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await updateSlideDeckConfig(
      c.var.ppk.projectDb,
      params.deck_id,
      body.config as SlideDeckConfig,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(
      c.var.ppk.projectId,
      "deck",
      params.deck_id,
      editorFromGlobalUser(c.var.globalUser),
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated,
    );

    const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
    if (decksRes.success) {
      notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
    }

    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "moveSlideDeckToFolder",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await moveSlideDeckToFolder(
      c.var.ppk.projectDb,
      params.deck_id,
      body.folderId,
    );
    if (res.success) {
      const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
      if (decksRes.success) {
        notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "duplicateSlideDeck",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await duplicateSlideDeck(
      c.var.ppk.projectDb,
      params.deck_id,
      body.label,
      body.folderId,
    );
    if (res.success) {
      const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
      if (decksRes.success) {
        notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "deleteSlideDeck",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params }) => {
    // Slide ids must be read BEFORE the delete (CASCADE removes the rows) so
    // their live rooms can be discarded — a room left behind would fail its
    // checkpoints forever.
    const deckRes = await getSlideDeckDetail(c.var.ppk.projectDb, params.deck_id);
    const slideIds = deckRes.success ? deckRes.data.slideIds : [];

    const res = await deleteSlideDeck(c.var.ppk.projectDb, params.deck_id);
    if (res.success) {
      for (const slideId of slideIds) {
        closeSlideRoom(c.var.ppk.projectId, slideId, "This slide was deleted");
      }
      const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
      if (decksRes.success) {
        notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
      }
    }
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "listDeckVersions",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await listDeckVersions(c.var.ppk.projectDb, params.deck_id);
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "getDeckVersion",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await getDeckVersion(
      c.var.ppk.projectDb,
      params.deck_id,
      params.version_id,
    );
    return c.json(res);
  },
);

defineRoute(
  routesSlideDecks,
  "restoreDeckVersion",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params }) => {
    const projectId = c.var.ppk.projectId;
    const projectDb = c.var.ppk.projectDb;
    const restorer = editorFromGlobalUser(c.var.globalUser);

    const versionRes = await getDeckVersion(
      projectDb,
      params.deck_id,
      params.version_id,
    );
    if (!versionRes.success) {
      return c.json(versionRes);
    }
    const version = versionRes.data;
    // Normalize to capture form ((i+1)*10 in order) so the restored-state
    // hash matches what the tracker computes from the DB afterwards.
    const snapshotSlides = version.slides
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s, i) => ({ id: s.id, sortOrder: (i + 1) * 10, config: s.config }));

    // Safety version FIRST: the current state is preserved before anything is
    // overwritten (skipped when it's already the newest stored version).
    const current = await loadDeckVersionData(projectId, params.deck_id);
    if (!current) {
      return c.json({ success: false as const, err: "Slide deck not found" });
    }
    const currentHash = hashVersionData(current);
    const latestRes = await latestDeckVersionHash(projectDb, params.deck_id);
    if (currentHash !== (latestRes.success ? latestRes.data.hash : null)) {
      const safetyRes = await insertDeckVersion(projectDb, {
        deckId: params.deck_id,
        createdAt: new Date().toISOString(),
        label: current.label,
        deckConfig: current.deckConfig,
        slides: current.slides,
        editors: [restorer],
        contentHash: currentHash,
      });
      if (!safetyRes.success) {
        return c.json(safetyRes);
      }
    }

    const plan = planDeckRestore(
      current.slides.map((s) => s.id),
      snapshotSlides,
    );

    // Discard rooms whose row is about to be deleted or re-created — a stale
    // room would fail checkpoints forever (deleted) or clobber the restored
    // row (re-inserted). Rooms of surviving slides stay alive: the restore
    // merges through them below, so co-editors follow it live.
    for (const id of plan.toDelete) {
      closeSlideRoom(projectId, id, "This slide was removed by a version restore");
    }
    for (const s of plan.toInsert) {
      closeSlideRoom(projectId, s.id, "This slide was replaced by a version restore");
    }

    const structRes = await restoreDeckStructure(
      projectDb,
      params.deck_id,
      version.label,
      version.deckConfig,
      plan,
    );
    if (!structRes.success) {
      return c.json(structRes);
    }
    let lastUpdated = structRes.data.lastUpdated;

    // Configs of surviving slides go through the live-room chokepoint (no
    // editor param: the restore versions itself below).
    for (const s of plan.toUpdate) {
      const roomLastUpdated = await applySlideToLiveRoom(
        projectId,
        s.id,
        s.config,
      );
      if (roomLastUpdated !== null) {
        lastUpdated = roomLastUpdated;
      } else {
        const res = await updateSlide(projectDb, s.id, s.config, undefined, undefined);
        if (res.success) {
          lastUpdated = res.data.lastUpdated;
        }
      }
    }

    // The restore itself appears in history (structure restored successfully
    // at this point, so a failed history insert must not fail the request).
    const restoredData = {
      label: version.label,
      deckConfig: version.deckConfig,
      slides: snapshotSlides,
    };
    const restoredRes = await insertDeckVersion(projectDb, {
      deckId: params.deck_id,
      createdAt: new Date().toISOString(),
      label: version.label,
      deckConfig: version.deckConfig,
      slides: snapshotSlides,
      editors: [restorer],
      contentHash: hashVersionData(restoredData),
      restoredFromVersionId: version.id,
    });
    if (!restoredRes.success) {
      console.error("Restored-state version insert failed:", restoredRes.err);
    }

    const touchedSlideIds = [
      ...new Set([
        ...plan.toDelete,
        ...plan.toInsert.map((s) => s.id),
        ...plan.toUpdate.map((s) => s.id),
      ]),
    ];
    notifyLastUpdated(projectId, "slides", touchedSlideIds, lastUpdated);
    notifyLastUpdated(projectId, "slide_decks", [params.deck_id], lastUpdated);
    const decksRes = await getAllSlideDecks(projectDb);
    if (decksRes.success) {
      notifyProjectSlideDecksUpdated(projectId, decksRes.data);
    }

    return c.json({ success: true as const, data: { lastUpdated } });
  },
);

defineRoute(
  routesSlideDecks,
  "copyDeckVersion",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await copyDeckFromVersion(
      c.var.ppk.projectDb,
      params.deck_id,
      params.version_id,
      body.label,
      body.folderId,
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [res.data.newDeckId],
      res.data.lastUpdated,
    );
    const decksRes = await getAllSlideDecks(c.var.ppk.projectDb);
    if (decksRes.success) {
      notifyProjectSlideDecksUpdated(c.var.ppk.projectId, decksRes.data);
    }

    return c.json(res);
  },
);
