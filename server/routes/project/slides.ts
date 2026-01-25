import { Hono } from "hono";
import {
  createSlide,
  deleteSlides,
  duplicateSlides,
  getSlide,
  getSlides,
  moveSlides,
  updateSlide,
  getSlideDeckDetail,
  updateSlideDeckPlan,
} from "../../db/mod.ts";
import { getProjectEditor, getProjectViewer } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlides = new Hono();

// Get all slides
defineRoute(
  routesSlides,
  "getSlides",
  getProjectViewer,
  async (c, { params }) => {
    const res = await getSlides(c.var.ppk.projectDb, params.deck_id);
    return c.json(res);
  }
);

// Get single slide
defineRoute(
  routesSlides,
  "getSlide",
  getProjectViewer,
  async (c, { params }) => {
    const res = await getSlide(c.var.ppk.projectDb, params.slide_id);
    return c.json(res);
  }
);

// Create slide
defineRoute(
  routesSlides,
  "createSlide",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await createSlide(
      c.var.ppk.projectDb,
      params.deck_id,
      body.afterSlideId,
      body.slide
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      [res.data.slideId],
      res.data.lastUpdated
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated
    );

    return c.json(res);
  }
);

// Update slide (replace entirely)
defineRoute(
  routesSlides,
  "updateSlide",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updateSlide(
      c.var.ppk.projectDb,
      params.slide_id,
      body.slide
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      [params.slide_id],
      res.data.lastUpdated
    );

    return c.json(res);
  }
);

// Delete slides
defineRoute(
  routesSlides,
  "deleteSlides",
  getProjectEditor,
  async (c, { params, body }) => {
    const lastUpdated = new Date().toISOString();

    const res = await deleteSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      body.slideIds,
      lastUpdated
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      lastUpdated
    );

    return c.json({
      success: true,
      data: { ...res.data, lastUpdated },
    });
  }
);

// Duplicate slides
defineRoute(
  routesSlides,
  "duplicateSlides",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await duplicateSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds
    );
    if (!res.success) {
      return c.json(res);
    }

    for (const slideId of res.data.newSlideIds) {
      notifyLastUpdated(
        c.var.ppk.projectId,
        "slides",
        [slideId],
        res.data.lastUpdated
      );
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated
    );

    return c.json(res);
  }
);

// Move slides
defineRoute(
  routesSlides,
  "moveSlides",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await moveSlides(
      c.var.ppk.projectDb,
      params.deck_id,
      body.slideIds,
      body.position
    );
    if (!res.success) {
      return c.json(res);
    }

    const lastUpdated = new Date().toISOString();

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      body.slideIds,
      lastUpdated
    );

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      lastUpdated
    );

    return c.json(res);
  }
);

// COMMENTED OUT: Plan feature hidden
// defineRoute(
//   routesSlides,
//   "updatePlan",
//   getProjectEditor,
//   async (c, { params, body }) => {
//     const deckId = params.deck_id;

//     const res = await updateSlideDeckPlan(
//       c.var.ppk.projectDb,
//       deckId,
//       body.plan
//     );
//     if (!res.success) {
//       return c.json(res);
//     }

//     notifyLastUpdated(
//       c.var.ppk.projectId,
//       "slide_decks",
//       [deckId],
//       res.data.lastUpdated
//     );

//     return c.json(res);
//   }
// );
