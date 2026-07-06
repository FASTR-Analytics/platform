import { Hono } from "hono";
import {
  createSlide,
  deleteSlides,
  duplicateSlides,
  getSlide,
  getSlides,
  moveSlides,
  updateSlide,
} from "../../db/mod.ts";
import type { Slide } from "lib";
import { applySlideToLiveRoom } from "../../collab/slide_rooms.ts";
import {
  editorFromGlobalUser,
  recordVersionEdit,
} from "../../collab/version_capture.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlides = new Hono();

// Get all slides
defineRoute(
  routesSlides,
  "getSlides",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await getSlides(c.var.ppk.projectDb, params.deck_id);
    return c.json(res);
  },
);

// Get single slide
defineRoute(
  routesSlides,
  "getSlide",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { params }) => {
    const res = await getSlide(c.var.ppk.projectDb, params.slide_id);
    return c.json(res);
  },
);

// Create slide
defineRoute(
  routesSlides,
  "createSlide",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await createSlide(
      c.var.ppk.projectDb,
      params.deck_id,
      body.position,
      body.slide as Slide,
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
      "slides",
      [res.data.slideId],
      res.data.lastUpdated,
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

// Update slide (replace entirely)
defineRoute(
  routesSlides,
  "updateSlide",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    // While a collab room is live for this slide, the room's doc is
    // authoritative: a direct DB write would be silently overwritten by the
    // room's next checkpoint. Route the save through the room instead — the
    // change merges into the shared doc (relayed live to connected editors)
    // and the room checkpoints it immediately. The expectedLastUpdated
    // conflict check doesn't apply on this path: merging into the live doc IS
    // the conflict resolution. (The room's checkpoint fires its own SSE
    // notifications.)
    const editor = editorFromGlobalUser(c.var.globalUser);
    const roomLastUpdated = await applySlideToLiveRoom(
      c.var.ppk.projectId,
      params.slide_id,
      body.slide as Slide,
      editor,
    );
    if (roomLastUpdated !== null) {
      return c.json({
        success: true as const,
        data: { lastUpdated: roomLastUpdated },
      });
    }

    const res = await updateSlide(
      c.var.ppk.projectDb,
      params.slide_id,
      body.slide as Slide,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

    recordVersionEdit(c.var.ppk.projectId, "deck", res.data.deckId, editor);

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      [params.slide_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);

// Delete slides
defineRoute(
  routesSlides,
  "deleteSlides",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const lastUpdated = new Date().toISOString();

    const res = await deleteSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds,
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
      "slides",
      body.slideIds,
      lastUpdated,
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      lastUpdated,
    );

    return c.json({
      success: true,
      data: { ...res.data, lastUpdated },
    });
  },
);

// Duplicate slides
defineRoute(
  routesSlides,
  "duplicateSlides",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await duplicateSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds,
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

    for (const slideId of res.data.newSlideIds) {
      notifyLastUpdated(
        c.var.ppk.projectId,
        "slides",
        [slideId],
        res.data.lastUpdated,
      );
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

// Move slides
defineRoute(
  routesSlides,
  "moveSlides",
  requireProjectPermission(
    { preventAccessToLockedProjects: true },
    "can_configure_slide_decks",
  ),
  async (c, { params, body }) => {
    const res = await moveSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds,
      body.position,
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
      "slides",
      body.slideIds,
      res.data.lastUpdated,
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated,
    );

    return c.json(res);
  },
);
