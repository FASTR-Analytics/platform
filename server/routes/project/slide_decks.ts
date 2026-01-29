import { Hono } from "hono";
import {
  getAllSlideDecks,
  getSlideDeckDetail,
  createSlideDeck,
  updateSlideDeckLabel,
  updateSlideDeckPlan,
  deleteSlideDeck,
} from "../../db/mod.ts";
import { getProjectEditor, getProjectViewer } from "../../project_auth.ts";
import { notifyLastUpdated } from "../../task_management/mod.ts";
import { notifyProjectUpdated } from "../../task_management/notify_last_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesSlideDecks = new Hono();

defineRoute(
  routesSlideDecks,
  "getAllSlideDecks",
  getProjectViewer,
  async (c) => {
    const res = await getAllSlideDecks(c.var.ppk.projectDb);
    return c.json(res);
  }
);

defineRoute(
  routesSlideDecks,
  "getSlideDeckDetail",
  getProjectViewer,
  async (c, { params }) => {
    const res = await getSlideDeckDetail(c.var.ppk.projectDb, params.deck_id);
    return c.json(res);
  }
);

defineRoute(
  routesSlideDecks,
  "createSlideDeck",
  getProjectEditor,
  async (c, { body }) => {
    const res = await createSlideDeck(c.var.ppk.projectDb, body.label);
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [res.data.deckId],
      res.data.lastUpdated
    );

    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);

    return c.json(res);
  }
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckLabel",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updateSlideDeckLabel(
      c.var.ppk.projectDb,
      params.deck_id,
      body.label
    );
    if (!res.success) {
      return c.json(res);
    }

    notifyLastUpdated(
      c.var.ppk.projectId,
      "slide_decks",
      [params.deck_id],
      res.data.lastUpdated
    );

    notifyProjectUpdated(c.var.ppk.projectId, res.data.lastUpdated);

    return c.json(res);
  }
);

defineRoute(
  routesSlideDecks,
  "updateSlideDeckPlan",
  getProjectEditor,
  async (c, { params, body }) => {
    const res = await updateSlideDeckPlan(
      c.var.ppk.projectDb,
      params.deck_id,
      body.plan
    );
    if (!res.success) {
      return c.json(res);
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

defineRoute(
  routesSlideDecks,
  "deleteSlideDeck",
  getProjectEditor,
  async (c, { params }) => {
    const res = await deleteSlideDeck(c.var.ppk.projectDb, params.deck_id);
    if (res.success) {
      notifyProjectUpdated(c.var.ppk.projectId, new Date().toISOString());
    }
    return c.json(res);
  }
);
