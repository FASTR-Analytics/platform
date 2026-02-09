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
      body.slide,
    );
    if (!res.success) {
      return c.json(res);
    }

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
    const res = await updateSlide(
      c.var.ppk.projectDb,
      params.slide_id,
      body.slide,
      body.expectedLastUpdated,
      body.overwrite,
    );
    if (!res.success) {
      return c.json(res);
    }

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
