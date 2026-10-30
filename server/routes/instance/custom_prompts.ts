import { Hono } from "hono";
import {
  createCustomPrompt,
  deleteCustomPrompt,
  getCustomPromptsForUser,
  updateCustomPrompt,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCustomPrompts = new Hono();

// Prompts are a prompt-injection surface (country-scoped ones are offered to
// every user's copilot), so publishing or re-scoping to "country" is
// admin-only.

defineRoute(
  routesCustomPrompts,
  "getCustomPrompts",
  async (c) => {
    const prompts = await getCustomPromptsForUser(
      c.var.mainDb,
      c.var.globalUser.email,
    );
    return c.json({ success: true, data: prompts });
  },
);

defineRoute(
  routesCustomPrompts,
  "createCustomPrompt",
  log("createCustomPrompt"),
  async (c, { body }) => {
    if (body.scope === "country" && !c.var.globalUser.isGlobalAdmin) {
      return c.json({
        success: false,
        err: "Country-scoped prompts require admin access",
      }, 403);
    }
    const prompt = await createCustomPrompt(c.var.mainDb, {
      id: crypto.randomUUID(),
      name: body.name,
      content: body.content,
      category: body.category,
      scope: body.scope,
      createdBy: c.var.globalUser.email,
    });
    return c.json({ success: true, data: prompt });
  },
);

defineRoute(
  routesCustomPrompts,
  "updateCustomPrompt",
  log("updateCustomPrompt"),
  async (c, { params, body }) => {
    if (body.scope === "country" && !c.var.globalUser.isGlobalAdmin) {
      return c.json({
        success: false,
        err: "Country-scoped prompts require admin access",
      }, 403);
    }
    const prompt = await updateCustomPrompt(
      c.var.mainDb,
      params.id,
      c.var.globalUser.email,
      c.var.globalUser.isGlobalAdmin,
      body,
    );
    if (!prompt) {
      return c.json({
        success: false,
        err: "Prompt not found or not authorized",
      }, 403);
    }
    return c.json({ success: true, data: prompt });
  },
);

defineRoute(
  routesCustomPrompts,
  "deleteCustomPrompt",
  log("deleteCustomPrompt"),
  async (c, { params }) => {
    const deleted = await deleteCustomPrompt(
      c.var.mainDb,
      params.id,
      c.var.globalUser.email,
      c.var.globalUser.isGlobalAdmin,
    );
    if (!deleted) {
      return c.json({
        success: false,
        err: "Prompt not found or not authorized",
      }, 403);
    }
    return c.json({ success: true });
  },
);
