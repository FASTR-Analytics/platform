import { Hono } from "hono";
import {
  createSlide,
  deleteSlides,
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
import { getSlideTitle, type DeckSummary } from "lib";

export const routesSlides = new Hono();

// Get deck summary (for AI context)
defineRoute(
  routesSlides,
  "getDeckSummary",
  getProjectViewer,
  async (c, { params }) => {
    const deckId = params.deck_id;

    const deckRes = await getSlideDeckDetail(c.var.ppk.projectDb, deckId);
    if (!deckRes.success) {
      return c.json(deckRes);
    }

    const slidesRes = await getSlides(c.var.ppk.projectDb, deckId);
    if (!slidesRes.success) {
      return c.json(slidesRes);
    }

    const summary: DeckSummary = {
      reportId: deckId,
      label: deckRes.data.label,
      plan: deckRes.data.plan,
      slides: slidesRes.data.map((s) => ({
        id: s.id,
        index: s.index,
        type: s.slide.type,
        title: getSlideTitle(s.slide),
      })),
      lastUpdated: deckRes.data.lastUpdated,
    };

    return c.json({ success: true, data: summary });
  }
);

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
      [res.data.slide.id],
      res.data.slide.lastUpdated
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
      [res.data.slide.id],
      res.data.slide.lastUpdated
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

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slides",
      body.slideIds,
      new Date().toISOString()
    );

    return c.json(res);
  }
);

// Update plan
defineRoute(
  routesSlides,
  "updatePlan",
  getProjectEditor,
  async (c, { params, body }) => {
    const deckId = params.deck_id;

    const res = await updateSlideDeckPlan(
      c.var.ppk.projectDb,
      deckId,
      body.plan
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [deckId],
      res.data.lastUpdated
    );

    return c.json(res);
  }
);

// Resolve figure - returns snapshot data
// TODO: Implement this in Phase 8 when we add figure snapshot support
defineRoute(
  routesSlides,
  "resolveFigure",
  getProjectViewer,
  async (c, { body }) => {
    // Placeholder - will implement when we add figure resolution logic
    // This needs to:
    // 1. Get presentation object config
    // 2. Get results data from module
    // 3. Build FigureInputs
    // 4. Return FigureSnapshot

    return c.json({
      success: false,
      err: "resolveFigure not yet implemented - Phase 8",
    });
  }
);
